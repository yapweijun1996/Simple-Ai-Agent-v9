/**
 * ./js/tools-service.js
 * Tools Service Module - Provides webSearch and readUrl functions for the AI agent.
 */
const ToolsService = (function() {
    'use strict';

    // Proxy list for bypassing CORS
    const proxies = [
      {
        name: 'CodeTabs',
        // A reliable CORS proxy that returns raw HTML
        formatUrl: url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        parseResponse: async res => res.text()
      },
      {
        name: 'AllOrigins',
        formatUrl: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        parseResponse: async res => res.text()
      },
      {
        name: 'ThingProxy',
        formatUrl: url => `https://thingproxy.freeboard.io/fetch/${url}`,
        parseResponse: async res => res.text()
      },
      {
        name: 'CorsProxyIO',
        formatUrl: url => `https://corsproxy.io/?${url}`,
        parseResponse: async res => res.text()
      }
    ];

    function getFinalUrl(rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.pathname === '/l/' && parsed.searchParams.has('uddg')) {
          return decodeURIComponent(parsed.searchParams.get('uddg'));
        }
      } catch {}
      return rawUrl;
    }

    /**
     * Performs a DuckDuckGo HTML search via proxies.
     * @param {string} query
     * @returns {Promise<Array<{title:string,url:string,snippet:string}>>}
     */
    async function webSearch(query) {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      for (const proxy of proxies) {
        try {
          const response = await fetch(proxy.formatUrl(ddgUrl));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const htmlString = await proxy.parseResponse(response);
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');
          const container = doc.getElementById('links');
          if (!container) throw new Error('No results container');
          const items = container.querySelectorAll('div.result');
          if (!items.length) throw new Error('No results');

          const results = [];
          items.forEach(item => {
            const anchor = item.querySelector('a.result__a');
            if (!anchor) return;
            const href = getFinalUrl(anchor.href);
            const title = anchor.textContent.trim();
            const snippetElem = item.querySelector('a.result__snippet, div.result__snippet');
            const snippet = snippetElem ? snippetElem.textContent.trim() : '';
            results.push({ title, url: href, snippet });
          });
          return results;
        } catch (err) {
          console.warn(`Proxy ${proxy.name} failed: ${err.message}`);
        }
      }
      throw new Error('All proxies failed');
    }

    /**
     * Fetches and returns text content from a URL via proxies.
     * @param {string} url
     * @returns {Promise<string>}
     */
    async function readUrl(url) {
      for (const proxy of proxies) {
        try {
          const response = await fetch(proxy.formatUrl(url));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const htmlString = await proxy.parseResponse(response);
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');
          return doc.body.textContent || '';
        } catch (err) {
          console.warn(`Proxy ${proxy.name} failed: ${err.message}`);
        }
      }
      throw new Error('All proxies failed');
    }

    return { webSearch, readUrl };
})(); 