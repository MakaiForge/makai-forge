/**
 * FOMOD ModuleConfig.xml Parser
 *
 * Parses FOMOD installer configuration files used by Bethesda mod managers.
 * Supports: conditionFlags, visible, typeDescriptor, dependencies, flag resolution.
 */

import fs from "node:fs";
import path from "node:path";
import type { FomodConfig, FomodStep, FomodPlugin, FomodGroup, FomodFile } from "./fomod-types";

class XmlNode {
  tag: string;
  attrs: Record<string, string> = {};
  children: XmlNode[] = [];
  text: string = "";
}

const KNOWN_GROUP_TYPES = new Set([
  "SelectAll", "SelectAtLeastOne", "SelectAtMostOne", "SelectExactlyOne", "SelectAny",
]);

function normalizeGroupType(raw: string): FomodGroup["type"] {
  if (KNOWN_GROUP_TYPES.has(raw)) return raw as FomodGroup["type"];
  if (raw.toLowerCase().includes("any")) return "SelectAtLeastOne";
  if (raw.toLowerCase().includes("all")) return "SelectAll";
  if (raw.toLowerCase().includes("exactly")) return "SelectExactlyOne";
  if (raw.toLowerCase().includes("atmost")) return "SelectAtMostOne";
  return "SelectAtLeastOne";
}

function readFileWithFallback(xmlPath: string): string {
  const buf = fs.readFileSync(xmlPath);
  const head = buf.slice(0, 4);
  if (head[0] === 0xFF && head[1] === 0xFE) return buf.toString("utf-16le");
  if (head[0] === 0xFE && head[1] === 0xFF) return buf.toString("utf-16le");
  if (buf.includes(0)) {
    try { return buf.toString("utf-16le"); } catch { /* fallthrough */ }
  }
  let text = buf.toString("utf-8");
  text = text.replace(/xmlns[^=]*="[^"]*"/g, "");
  return text;
}

function lexXml(text: string): string[] {
  const tokens: string[] = [];
  const re = /<[^>]*>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const t = match[0].trim();
    if (t) tokens.push(t);
  }
  return tokens;
}

function parseXml(text: string): XmlNode {
  const tokens = lexXml(text);
  const root = new XmlNode();
  root.tag = "#root";
  const stack: XmlNode[] = [root];

  for (const token of tokens) {
    if (token.startsWith("</")) {
      stack.pop();
    } else if (token.startsWith("<?")) {
      // processing instruction — skip
    } else if (token.startsWith("<!--")) {
      // comment — skip
    } else if (token.startsWith("<![CDATA[")) {
      const content = token.slice(9, -3);
      if (stack.length > 0) {
        const node = new XmlNode();
        node.tag = "#cdata";
        node.text = content;
        stack[stack.length - 1].children.push(node);
      }
    } else if (token.startsWith("<")) {
      const selfClosing = token.endsWith("/>");
      const inner = selfClosing ? token.slice(1, -2) : token.slice(1, -1);
      const parts = inner.split(/\s+/);
      const tag = parts[0];
      const node = new XmlNode();
      node.tag = tag;

      const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRe.exec(inner)) !== null) {
        node.attrs[attrMatch[1]] = attrMatch[2];
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }
      if (!selfClosing) {
        stack.push(node);
      }
    } else {
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent.children.length > 0 && parent.children[parent.children.length - 1].tag === "#text") {
          parent.children[parent.children.length - 1].text += token;
        } else {
          const textNode = new XmlNode();
          textNode.tag = "#text";
          textNode.text = token;
          parent.children.push(textNode);
        }
      }
    }
  }

  return root;
}

function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find(c => c.tag === tag);
}

function findChildren(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter(c => c.tag === tag);
}

function getChildText(node: XmlNode | undefined): string {
  if (!node) return "";
  return node.children
    .filter(c => c.tag === "#text" || c.tag === "#cdata")
    .map(c => c.text)
    .join("")
    .trim();
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function parseFiles(node: XmlNode): FomodFile[] {
  const files: FomodFile[] = [];
  // Some FOMOD XMLs wrap <file>/<folder> inside a <files> node; others put them
  // directly inside the parent. Support both formats.
  const filesWrapper = findChild(node, "files");
  const container = filesWrapper || node;
  for (const fileNode of findChildren(container, "file")) {
    files.push({
      source: normalizePath(fileNode.attrs["source"] || ""),
      destination: normalizePath(fileNode.attrs["destination"] || ""),
      priority: parseInt(fileNode.attrs["priority"] || "0", 10),
      alwaysInstall: fileNode.attrs["alwaysInstall"] === "true",
    });
  }
  for (const folderNode of findChildren(container, "folder")) {
    const source = normalizePath(folderNode.attrs["source"] || "");
    const dest = folderNode.attrs["destination"] !== undefined
      ? normalizePath(folderNode.attrs["destination"])
      : "";
    files.push({
      source,
      destination: dest,
      priority: 0,
      alwaysInstall: true,
    });
  }
  return files;
}

function parseConditionFlags(node: XmlNode): Record<string, string> | null {
  const cf = findChild(node, "conditionFlags");
  if (!cf) return null;
  const flags: Record<string, string> = {};
  for (const child of cf.children) {
    if (child.tag !== "flag") continue;
    const name = child.attrs["name"] || "";
    if (!name) continue;
    const value = child.attrs["value"] || getChildText(child) || "true";
    flags[name] = value;
  }
  return Object.keys(flags).length > 0 ? flags : null;
}

function parseDependencies(node: XmlNode): Record<string, string> | null {
  const deps = findChild(node, "dependencies");
  if (!deps) return null;
  const flags: Record<string, string> = {};
  for (const dep of deps.children) {
    if (dep.tag !== "flagDependency") continue;
    const flag = dep.attrs["flag"] || "";
    if (!flag) continue;
    const value = dep.attrs["value"] || "true";
    flags[flag] = value;
  }
  return Object.keys(flags).length > 0 ? flags : null;
}

function parseVisible(node: XmlNode): Record<string, string> | null {
  const vis = findChild(node, "visible");
  if (!vis) return null;
  const flags: Record<string, string> = {};
  // Support <flagDependency> directly under <visible> or wrapped in <dependencies>
  const depsWrapper = findChild(vis, "dependencies");
  const container = depsWrapper || vis;
  for (const child of container.children) {
    if (child.tag !== "flagDependency") continue;
    const flag = child.attrs["flag"] || "";
    if (!flag) continue;
    const value = child.attrs["value"] || "true";
    flags[flag] = value;
  }
  return Object.keys(flags).length > 0 ? flags : null;
}

function parseTypeDescriptor(node: XmlNode): string {
  const type = findChild(node, "typeDescriptor");
  if (type) {
    const typeChild = findChild(type, "type");
    if (typeChild) return typeChild.attrs["name"] || "SelectExactlyOne";
    return type.attrs["name"] || "SelectExactlyOne";
  }
  return node.attrs["type"] || "SelectExactlyOne";
}

function parsePluginType(pluginNode: XmlNode): string | undefined {
  if (pluginNode.attrs["type"]) return pluginNode.attrs["type"];
  if (pluginNode.attrs["value"]) return pluginNode.attrs["value"];
  const td = findChild(pluginNode, "typeDescriptor");
  if (!td) return undefined;
  const typeChild = findChild(td, "type");
  if (typeChild) return typeChild.attrs["name"] || undefined;
  return td.attrs["name"] || undefined;
}

function parsePlugin(pluginNode: XmlNode): FomodPlugin {
  return {
    name: pluginNode.attrs["name"] || "Unnamed",
    description: getChildText(findChild(pluginNode, "description")) || undefined,
    type: parsePluginType(pluginNode),
    image_path: pluginNode.attrs["image"] || undefined,
    files: parseFiles(pluginNode),
    condition_flags: parseConditionFlags(pluginNode) || undefined,
    dependencies: parseDependencies(pluginNode) || undefined,
  };
}

function parseGroup(groupNode: XmlNode, fallbackPlugins: XmlNode[]): FomodGroup {
  const plugins: FomodPlugin[] = [];
  const pluginContainer = findChild(groupNode, "plugins");
  const pluginNodes = pluginContainer ? findChildren(pluginContainer, "plugin") : [];
  if (pluginNodes.length > 0) {
    for (const pn of pluginNodes) {
      plugins.push(parsePlugin(pn));
    }
  } else {
    for (const optNode of findChildren(groupNode, "plugin")) {
      plugins.push(parsePlugin(optNode));
    }
  }
  if (plugins.length === 0) {
    for (const fb of fallbackPlugins) {
      plugins.push(parsePlugin(fb));
    }
  }
  return {
    name: groupNode.attrs["name"] || "Group",
    type: normalizeGroupType(parseTypeDescriptor(groupNode)),
    plugins,
  };
}

function parseGroupsInStep(stepNode: XmlNode): FomodGroup[] {
  const groups: FomodGroup[] = [];

  const optFileGroups = findChild(stepNode, "optionalFileGroups");
  const groupContainer = optFileGroups || stepNode;

  const explicitGroups = findChildren(groupContainer, "group");
  const directOptions = findChildren(stepNode, "option");

  if (explicitGroups.length > 0) {
    for (const g of explicitGroups) {
      groups.push(parseGroup(g, directOptions));
    }
  } else if (directOptions.length > 0) {
    groups.push({
      name: stepNode.attrs["name"] || "Group",
      type: stepNode.attrs["optional"] === "true" ? "SelectAtLeastOne" : "SelectExactlyOne",
      plugins: directOptions.map(opt => ({
        name: opt.attrs["name"] || "Unnamed",
        description: getChildText(findChild(opt, "description")) || undefined,
        type: opt.attrs["type"] || undefined,
        image_path: opt.attrs["image"] || undefined,
        files: parseFiles(opt),
        condition_flags: parseDependencies(opt) || undefined,
      })),
    });
  }

  return groups;
}

export function parseFomodXml(xmlPath: string): FomodConfig | null {
  if (!fs.existsSync(xmlPath)) return null;
  const text = readFileWithFallback(xmlPath);
  const root = parseXml(text);

  const config = findChild(root, "config") || findChild(root, "module") || findChild(root, "fomod");
  if (!config) return null;

  const moduleName = getChildText(findChild(config, "moduleName")) ||
    getChildText(findChild(config, "name")) ||
    path.basename(path.dirname(xmlPath));

  const moduleImage = findChild(config, "moduleImage")?.attrs["path"] || undefined;

  const required = findChild(config, "requiredInstallFiles") ||
    findChild(config, "requiredFiles");
  const reqFiles = required ? parseFiles(required) : [];

  const steps: FomodStep[] = [];
  const installSteps = findChild(config, "installSteps") ||
    findChild(config, "steps") ||
    findChild(config, "stepList");
  if (installSteps) {
    const stepTags = ["step", "installStep"];
    for (const stepTag of stepTags) {
      for (const stepNode of findChildren(installSteps, stepTag)) {
        steps.push({
          id: `step-${steps.length}`,
          name: stepNode.attrs["name"] || "Unnamed Step",
          groups: parseGroupsInStep(stepNode),
          visible: parseVisible(stepNode) || undefined,
        });
      }
    }
  }

  return { name: moduleName, module_image_path: moduleImage, steps, required_files: reqFiles.length > 0 ? reqFiles : undefined };
}

function flagsSatisfied(
  required: Record<string, string> | undefined,
  activeFlags: Record<string, string>,
): boolean {
  if (!required) return true;
  for (const [flag, value] of Object.entries(required)) {
    if (activeFlags[flag] !== value) return false;
  }
  return true;
}

function computeActiveFlags(
  config: FomodConfig,
  selections: Record<string, string[]>,
): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const step of config.steps) {
    const stepSelections = selections[step.id] || selections[step.name] || [];
    for (const group of step.groups) {
      for (const plugin of group.plugins) {
        if (stepSelections.includes(plugin.name) && plugin.condition_flags) {
          Object.assign(flags, plugin.condition_flags);
        }
      }
    }
  }
  return flags;
}

export function resolveFomodFiles(
  config: FomodConfig,
  selections: Record<string, string[]>,
): { source: string; destination: string }[] {
  const pairs: { source: string; destination: string }[] = [];
  const activeFlags = computeActiveFlags(config, selections);

  for (const f of config.required_files || []) {
    pairs.push({ source: f.source, destination: f.destination });
  }

  for (const step of config.steps) {
    if (!flagsSatisfied(step.visible, activeFlags)) continue;

    const stepSelections = selections[step.id] || selections[step.name] || [];
    for (const group of step.groups) {
      for (const plugin of group.plugins) {
        if (!flagsSatisfied(plugin.dependencies, activeFlags)) continue;
        if (stepSelections.includes(plugin.name)) {
          for (const f of plugin.files) {
            pairs.push({ source: f.source, destination: f.destination });
          }
        }
      }
    }
  }

  return pairs;
}
