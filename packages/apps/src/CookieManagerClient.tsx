import React, { useEffect, useState } from 'react';
import 'react-cookie-manager/dist/style.css';

const CONSENT_COUNTRIES = new Set<string>([
  // EU
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  // EEA (non-EU)
  'IS','LI','NO',
  // UK
  'GB',
  // Canada
  'CA'
]);

// Small helper: fetch with timeout
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 1200) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Try multiple lightweight country sources
async function detectCountryCode(): Promise<string | null> {
  try {
    // api.country.is — returns {"country":"US"}
    const r = await fetchWithTimeout('https://api.country.is', {}, 900);
    if (r.ok) {
      const j = await r.json();
      if (j?.country) return String(j.country);
    }
  } catch (_) {}

  try {
    // geojs — returns {"country":"US"}
    const r = await fetchWithTimeout('https://get.geojs.io/v1/ip/country.json', {}, 900);
    if (r.ok) {
      const j = await r.json();
      if (j?.country) return String(j.country);
    }
  } catch (_) {}

  try {
    // ipapi — returns "US" as plain text
    const r = await fetchWithTimeout('https://ipapi.co/country/', {}, 900);
    if (r.ok) {
      const t = (await r.text()).trim();
      if (/^[A-Z]{2}$/.test(t)) return t;
    }
  } catch (_) {}

  return null;
}

const loadAnalytics = () => {
  if (location.hostname !== "localhost") {
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      const gaScript = document.createElement('script');
      gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-MKM4N6Z98X';
      gaScript.async = true;
      document.head.appendChild(gaScript);
    }

    const inlineScript = document.createElement('script');
    inlineScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-MKM4N6Z98X');
    `;
    document.head.appendChild(inlineScript);

    const existingYM = Array.from(document.scripts).find(s => s.src === 'https://mc.yandex.ru/metrika/tag.js');
    if (existingYM) return;

    const ymScript = document.createElement('script');
    ymScript.type = 'text/javascript';
    ymScript.innerHTML = `
      (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j].src === r) return;
        }
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
      })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

      ym(96307351, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true,
        webvisor:true
      });
    `;
    document.head.appendChild(ymScript);

    const noscript = document.createElement('noscript');
    noscript.innerHTML = `
      <div><img src="https://mc.yandex.ru/watch/96307351" style="position:absolute; left:-9999px;" alt="" /></div>
    `;
    document.body.appendChild(noscript);
  }
};

// 1. Define the props for the CookieManager component
interface CookieManagerProps {
  translations: {
    title: string;
    message: string;
  };
  displayType?: 'modal' | 'banner';
  theme?: 'light' | 'dark';
  privacyPolicyUrl?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onManage?: (preferences: { Analytics?: boolean }) => void;
}

const CookieManagerClient: React.FC = () => {
  const [CookieManagerComponent, setCookieManagerComponent] = useState<React.ComponentType<CookieManagerProps> | null>(null);

  const [shouldShowCMP, setShouldShowCMP] = useState<boolean | null>(null);

  // Lazy-load CMP component
  useEffect(() => {
    import('react-cookie-manager').then((mod) => {
      setCookieManagerComponent(() => mod.CookieManager as React.ComponentType<CookieManagerProps>);
    });
  }, []);

  // Geo decision: show CMP only in EU/EEA/UK/CA; otherwise load analytics now
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Respect localhost: do nothing
      if (location.hostname === 'localhost') {
        if (!cancelled) setShouldShowCMP(false);
        return;
      }

      // If the user agent signals Global Privacy Control, prefer showing CMP
      const gpc = (navigator as any).globalPrivacyControl === true;

      const cc = await detectCountryCode();
      console.log('Country: ', cc);
      
      const inConsentRegion = cc ? CONSENT_COUNTRIES.has(cc.toUpperCase()) : true; // default conservative when unknown

      if (cancelled) return;

      if (gpc || inConsentRegion) {
        setShouldShowCMP(true);
      } else {
        setShouldShowCMP(false);
        loadAnalytics();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Don’t render anything until we decide
  if (CookieManagerComponent == null || shouldShowCMP == null) return null;

  if (!shouldShowCMP) return null; // outside consent regions → no plate

  return (
    <CookieManagerComponent
      translations={{
        title: "Cookie Preferences",
        message:
          "We use cookies to enhance your experience and analyze site usage. If you are under the age of consent required by your jurisdiction, please press Decline and do not proceed without parental or guardian approval. If you are an adult or have obtained the necessary consent, you may proceed and make your own choices.",
      }}
      displayType="modal"
      theme="light"
      privacyPolicyUrl="https://slonig.org/privacy-policy"
      onAccept={() => {
        loadAnalytics();
      }}
      onDecline={() => {}}
      onManage={(preferences: { Analytics?: boolean }) => {
        if (preferences?.Analytics) {
          loadAnalytics();
        }
      }}
    />
  );
};

export default CookieManagerClient;