export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
  audible: boolean;
}

export interface ExtInfo {
  id: string;
  name: string;
  icon: string;
}

export interface BrowserMirrorProps {
  defaultUrl?: string;
  mirrorId: string;
}
