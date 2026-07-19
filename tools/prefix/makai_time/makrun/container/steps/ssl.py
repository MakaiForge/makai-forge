from pathlib import Path
from makrun.container.steps import StepResult


def configure(config: dict) -> StepResult:
    """Monta certificados SSL do host."""
    args = []

    # Debian/Ubuntu
    ssl_certs = Path("/etc/ssl")
    if ssl_certs.is_dir():
        args.extend(["--ro-bind", "/etc/ssl", "/etc/ssl"])

    # Debian ca-certificates
    ca_certs = Path("/etc/ca-certificates")
    if ca_certs.is_dir():
        args.extend(["--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates"])

    # Red Hat/Fedora
    pki_tls = Path("/etc/pki/tls/certs")
    if pki_tls.is_dir():
        args.extend(["--ro-bind", str(pki_tls), "/etc/pki/tls/certs"])

    pki_ca = Path("/etc/pki/ca-trust/extracted")
    if pki_ca.is_dir():
        args.extend(["--ro-bind", str(pki_ca), "/etc/pki/ca-trust/extracted"])

    # Arch Linux
    ca_bundle = Path("/etc/ca-certificates/extracted")
    if ca_bundle.is_dir():
        args.extend(["--ro-bind", str(ca_bundle), "/etc/ca-certificates/extracted"])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"ssl: {len(args)//2} paths montados" if applied else "ssl: skipped",
    )
