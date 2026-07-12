export const VERIFY_BASE_URL = "http://10.11.0.2:7000/_test_";
export const DEBUG = false;

export function log(...args) {
  if (DEBUG) console.log(...args);
}

export function logError(...args) {
  if (DEBUG) console.error(...args);
}


export const PROXY_HOSTS_A = [
  "efr-marktplatz.club",
  "voteshirleysew.club",
  "carolinafreigh.fun",
  "purposebydesig.club",
  "mmgr.club",
  "webdrone.club",
  "ictabernacle.info",
  "jewelscollecti.icu",
  "berniesbodybla.fun",
  "fullmanfirm.icu",
  "miamigoskennel.fun",
  "goedkoopgeluid.icu",
  "tzoa.fun",
  "kimberlymilano.icu",
  "crosscards.site",
  "jgwynphotoarts.pro",
  "indextraub.online",
  "purecambogiasl.live",
  "zebpay.site",
  "southwestcoast.pro"
];

export const PROXY_HOSTS_B = [
  "www.mohegansuncasi.online",
  "www.hullwiper.live",
  "www.anokhiiwade.info",
  "www.tecnopay.online",
  "www.i-mopachores.live",
  "www.wpfaststart.info",
  "www.art1p.pro",
  "www.roccosiffredi.online",
  "www.saifrizvi.live",
  "www.rmtonthebeach.info",
  "www.donelikeyester.space",
  "www.yoakumselfstor.website",
  "www.passportsusa.space",
  "www.uatgc.website",
  "www.ahikeleher.site",
  "www.helpinghandsof.space",
  "www.onedaijo.website",
  "www.templarknights.site",
  "www.aoeah.space",
  "www.stratfordrc.website",
  "www.all4women.space",
  "www.keukataxi.website",
  "www.carimflex.site",
  "www.peacefulbodies.xyz",
  "www.vogelsenmeer.xyz",
  "www.9ts3tpia.world",
  "www.ruimte-18.xyz",
  "www.nogielectric.world",
  "www.bodrumexpresso.xyz",
  "www.jaqandlelights.world"
];

export const STORAGE_DEFAULTS = {
  enabled: true,
  state: "disconnect",
  runCount: 0,
  enableCount: 0,
  uid: "",
  pops: 0,
  tabid: 0,
  popsResetTime: 0,
  lastPopTime: 0,
  lastVerifyTime: 0,
  lastVerifyTag: "init",
  safeBrowsingEnabled: true,
  successfulConnectCount: 0,
  safeBrowsingDisclosureShown: true,
  safeBrowsingUserId: ""
};
