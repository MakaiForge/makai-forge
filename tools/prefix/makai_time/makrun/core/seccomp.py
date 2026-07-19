"""
Filtro seccomp BPF para o container Makai Time.

Similar ao que o pressure-vessel faz: bloqueia syscalls perigosos
que um jogo/Proton dentro do container nunca deveria chamar.

Syscalls bloqueados:
  - reboot, kexec_load, kexec_file_load (reinicialização)
  - init_module, finit_module, delete_module (manipulação de kernel)
  - iopl, ioperm (acesso a portas de hardware)
  - swapon, swapoff (troca de memória)

Uso:
    fd = get_seccomp_fd()  # → FD para --add-seccomp-fd
    # bwrap recebe: --add-seccomp-fd <fd>
"""

import array
import os
import struct

# -------------------------------
# BPF opcodes
# -------------------------------
BPF_LD = 0x00
BPF_W = 0x00
BPF_ABS = 0x20

BPF_JMP = 0x05
BPF_JEQ = 0x10
BPF_K = 0x00
BPF_JGT = 0x20
BPF_JGE = 0x30

BPF_RET = 0x06

# SECCOMP_RET valores
SECCOMP_RET_KILL = 0x00000000
SECCOMP_RET_ALLOW = 0x7fff0000

# -- Seccomp data offset (cabeçalho seccomp_data)
# offset 0: nr (syscall number) — arch-independent
OFFSET_NR = 0
# offset 4: arch
OFFSET_ARCH = 4
# offset 8: instruction_pointer
OFFSET_IP = 8

# -- Arquiteturas suportadas
AUDIT_ARCH_X86_64 = 0xC000003E
AUDIT_ARCH_I386 = 0x40000003


def _make_bpf(code: int, jt: int, jf: int, k: int) -> bytes:
    """Uma instrução BPF: 8 bytes."""
    return struct.pack("<HBBI", code, jt & 0xFF, jf & 0xFF, k & 0xFFFFFFFF)


def _bpf_load_abs(offset: int) -> bytes:
    """BPF_LD | BPF_W | BPF_ABS — carrega 4 bytes da posição 'offset'."""
    return _make_bpf(BPF_LD | BPF_W | BPF_ABS, 0, 0, offset)


def _bpf_jmp_eq(k: int, jt: int, jf: int) -> bytes:
    """BPF_JMP | BPF_JEQ | BPF_K — salta se dados == k."""
    return _make_bpf(BPF_JMP | BPF_JEQ | BPF_K, jt, jf, k)


def _bpf_ret(k: int) -> bytes:
    """BPF_RET | BPF_K — retorna k (SECCOMP_RET_KILL ou ALLOW)."""
    return _make_bpf(BPF_RET | BPF_K, 0, 0, k)


# -- Syscall numbers (x86_64)
NR_REBOOT_X86_64 = 169
NR_KEXEC_LOAD_X86_64 = 246
NR_KEXEC_FILE_LOAD_X86_64 = 320
NR_INIT_MODULE_X86_64 = 175
NR_FINIT_MODULE_X86_64 = 313
NR_DELETE_MODULE_X86_64 = 176
NR_IOPL_X86_64 = 172
NR_IOPERM_X86_64 = 173
NR_SWAPON_X86_64 = 167
NR_SWAPOFF_X86_64 = 168

# -- Syscall numbers (i386)
NR_REBOOT_I386 = 88
NR_KEXEC_LOAD_I386 = 283
NR_KEXEC_FILE_LOAD_I386 = 320
NR_INIT_MODULE_I386 = 128
NR_FINIT_MODULE_I386 = 313
NR_DELETE_MODULE_I386 = 129
NR_IOPL_I386 = 172
NR_IOPERM_I386 = 173
NR_SWAPON_I386 = 87
NR_SWAPOFF_I386 = 88  # mesmo nr do reboot no i386? cuidado

# Lista unificada de syscalls bloqueados para x86_64
BLOCKED_X86_64 = [
    NR_REBOOT_X86_64,
    NR_KEXEC_LOAD_X86_64,
    NR_KEXEC_FILE_LOAD_X86_64,
    NR_INIT_MODULE_X86_64,
    NR_FINIT_MODULE_X86_64,
    NR_DELETE_MODULE_X86_64,
    NR_IOPL_X86_64,
    NR_IOPERM_X86_64,
    NR_SWAPON_X86_64,
    NR_SWAPOFF_X86_64,
]

BLOCKED_I386 = [
    NR_REBOOT_I386,
    NR_KEXEC_LOAD_I386,
    NR_KEXEC_FILE_LOAD_I386,
    NR_INIT_MODULE_I386,
    NR_FINIT_MODULE_I386,
    NR_DELETE_MODULE_I386,
    NR_IOPL_I386,
    NR_IOPERM_I386,
    NR_SWAPON_I386,
    NR_SWAPOFF_I386,
]


def _build_bpf_filter(arch: int, blocked_nrs: list[int]) -> bytes:
    """Monta programa BPF para uma arquitetura.

    Pipeline:
      1. Carrega nr da syscall (offset 0)
      2. Para cada syscall bloqueado, testa igualdade
      3. Se igual → KILL
      4. Se não → testa próximo
      5. Se nenhum → ALLOW
    """
    prog = bytearray()
    # Carrega syscall number
    prog.extend(_bpf_load_abs(OFFSET_NR))

    # Para cada syscall bloqueado: JEQ → KILL (jt salta 1, jf continua)
    # Mas se for KILL, retorna imediatamente (sem precisar de próxima instrução)
    # Precisa de 2 instruções: JEQ e RET_KILL
    # No final: RET_ALLOW

    # Para cada syscall, gera:
    #   JEQ nr, +2, 0  (se igual, salta 2 instruções → RET_KILL)
    #   ... continua ...
    # Depois de todos: RET_ALLOW

    # Tamanho do bloco por syscall: 2 instruções (JEQ + condicional)
    # Mas a JEQ desvia para RET_KILL que está DEPOIS do último syscall
    # O número de instruções restantes após cada JEQ varia
    #
    # Estrutura:
    #   load_nr
    #   jeq nr1, KILL_LABEL, NEXT      → se nr1, salta para KILL
    #   jeq nr2, KILL_LABEL, NEXT      → se nr2, salta para KILL
    #   ...
    # KILL_LABEL:
    #   ret KILL
    # NEXT:
    #   ret ALLOW
    #
    # Mas o BPF não tem labels. Tem que calcular jumps relativos.
    # Após cada jeq:
    #   - jt = (blocked_nrs - idx - 1) * 1 + 1  (pula bloqueios restantes + ret_kill)
    #   - jf = 1 (pula 1 instrução — vai para a PRÓXIMA instrução)

    n = len(blocked_nrs)
    for idx, nr in enumerate(blocked_nrs):
        remaining_checks = n - 1 - idx  # checks AFTER this one
        jt = remaining_checks           # match → skip to KILL
        jf = 1 if idx == n - 1 else 0   # last: no-match → skip KILL to ALLOW
        prog.extend(_bpf_jmp_eq(nr, jt, jf))

    # KILL_LABEL
    prog.extend(_bpf_ret(SECCOMP_RET_KILL))
    # ALLOW
    prog.extend(_bpf_ret(SECCOMP_RET_ALLOW))

    return bytes(prog)


def _make_sock_fprog(prog: bytes) -> bytes:
    """Prepara dados BPF crus para --add-seccomp-fd.

    Bwrap 0.11.x lê TODO o conteúdo do FD como um array de
    struct sock_filter (8 bytes cada), SEM cabeçalho.
    Apenas raw BPF instructions.

    struct sock_filter {
        uint16 code;
        uint8  jt;
        uint8  jf;
        uint32 k;
    };  // 8 bytes

    Fonte: bubblewrap.c → seccomp_program_new():
        data = load_file_data(fd, &len);
        if (len % 8 != 0) die("Invalid seccomp data");
        program.len = len / 8;
        program.filter = (struct sock_filter *) data;
    """
    return prog  # raw BPF instructions, sem header


# FD do filtro seccomp — armazenado como singleton para sobreviver
# até o subprocess.Popen. O Popen fecha todos FDs >= 3 por padrão
# (close_fds=True), então precisamos passá-lo via pass_fds.
_seccomp_fd: int | None = None


def get_seccomp_fd() -> int | None:
    """Retorna FD com filtro seccomp BPF, ou None se falhar.

    O FD pode ser passado para bwrap via --add-seccomp-fd <fd>.
    O bwrap lê o filtro e aplica seccomp(2) no processo filho
    ANTES de executar o binário alvo.

    Retorna:
        int: file descriptor (fechar após usar!)
        None: se não foi possível criar o FD
    """
    global _seccomp_fd
    if _seccomp_fd is not None:
        return _seccomp_fd
    try:
        prog_x86 = _build_bpf_filter(AUDIT_ARCH_X86_64, BLOCKED_X86_64)

        sock_fprog = _make_sock_fprog(prog_x86)

        pipe_r, pipe_w = os.pipe()
        try:
            os.write(pipe_w, sock_fprog)
            os.close(pipe_w)
            _seccomp_fd = pipe_r
            return pipe_r
        except OSError:
            os.close(pipe_r)
            os.close(pipe_w)
            return None
    except Exception:
        return None


def get_seccomp_read_fd() -> int | None:
    """Retorna o FD do filtro seccomp atual, se existir.

    Usado por run_command() para incluir no pass_fds do Popen.
    """
    return _seccomp_fd


def close_seccomp_fd() -> None:
    """Fecha o FD do seccomp, se aberto."""
    global _seccomp_fd
    if _seccomp_fd is not None:
        try:
            os.close(_seccomp_fd)
        except OSError:
            pass
        _seccomp_fd = None
