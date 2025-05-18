import React, { useEffect, useState } from 'react';
import 'react-cookie-manager/dist/style.css';

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

  useEffect(() => {
    import('react-cookie-manager').then((mod) => {
      setCookieManagerComponent(() => mod.CookieManager as React.ComponentType<CookieManagerProps>);
    });
  }, []);

  if (!CookieManagerComponent) return null;

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