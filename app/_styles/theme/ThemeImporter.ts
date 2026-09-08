import type { Theme, MakaiThemeV3 } from '@types';

function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)![1];
  const bytes = atob(parts[1]);
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

export class ThemeImporter {
  static async importFromFile(file: File): Promise<Theme> {
    const arrayBuffer = await file.arrayBuffer();

    // Plain JSON fallback (v2 format)
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const text = new TextDecoder().decode(arrayBuffer);
      const data = JSON.parse(text);
      return this.v2JsonToTheme(data);
    }

    // ZIP format
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);

      const jsonFile = zip.file('theme.json');
      if (!jsonFile) throw new Error('theme.json not found in archive');

      const raw = await jsonFile.async('string');
      const data: MakaiThemeV3 = JSON.parse(raw);

      const vars = data.variables || {};
      const varEntries = Object.entries(vars).filter(
        ([, v]) => v && v.trim() !== ''
      );

      let css = ':root {\n';
      for (const [key, value] of varEntries) {
        css += `  ${key}: ${value};\n`;
      }
      css += '}\n';

      const cssFile = zip.file('theme.css');
      if (cssFile) {
        css += `\n${await cssFile.async('string')}`;
      }

      return {
        id: data.id || crypto.randomUUID(),
        name: data.name || 'Imported Theme',
        author: data.author,
        authorName: undefined,
        isActive: false,
        code: css,
        vars,
        hasCustomSound: data.hasSound,
        background: data.background || null,
        soundFileName: data.soundFileName || null,
        createdAt: new Date(data.createdAt || Date.now()),
        updatedAt: new Date(data.updatedAt || Date.now()),
      };
    } catch {
      throw new Error('Invalid .makaitheme file');
    }
  }

  static importFromJsonText(text: string): Theme {
    const data = JSON.parse(text);
    return this.v2JsonToTheme(data);
  }

  private static v2JsonToTheme(data: any): Theme {
    const vars: Record<string, string> = data.vars || data.variables || {};

    let css = data.css || '';
    if (!css && Object.keys(vars).length > 0) {
      css = ':root {\n';
      for (const [k, v] of Object.entries(vars)) {
        css += `  ${k}: ${v};\n`;
      }
      css += '}\n';
    }

    return {
      id: crypto.randomUUID(),
      name: data.name || 'Imported Theme',
      isActive: false,
      code: css,
      vars,
      hasCustomSound: !!(data.sound || data.hasSound),
      soundFileName: data.soundFileName || null,
      background: data.background || null,
      createdAt: new Date(data.createdAt || Date.now()),
      updatedAt: new Date(data.updatedAt || Date.now()),
    };
  }

  static varsToCss(vars: Record<string, string>): string {
    let css = ':root {\n';
    for (const [k, v] of Object.entries(vars)) {
      css += `  ${k}: ${v};\n`;
    }
    css += '}\n';
    return css;
  }
}
