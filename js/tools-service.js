/**
 * ./js/tools-service.js
 * Tools Service Module - Provides webSearch and readUrl functions for the AI agent.
 */
const ToolsService = (function() {
    'use strict';

    // Proxy list for bypassing CORS
    const proxies = [
      { name: 'CodeTabs',          formatUrl: url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,                      parseResponse: async res => res.text() },
      { name: 'AllOrigins (win)',  formatUrl: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,                parseResponse: async res => res.text() },
      { name: 'AllOrigins (cf)',   formatUrl: url => `https://api.allorigins.cf/raw?url=${encodeURIComponent(url)}`,                parseResponse: async res => res.text() },
      { name: 'AllOrigins (pro)',  formatUrl: url => `https://api.allorigins.pro/raw?url=${encodeURIComponent(url)}`,               parseResponse: async res => res.text() },
      { name: 'AllOrigins (app)',  formatUrl: url => `https://allorigins.appspot.com/raw?url=${encodeURIComponent(url)}`,            parseResponse: async res => res.text() },
      { name: 'CORS Anywhere',     formatUrl: url => `https://cors-anywhere.herokuapp.com/${url}`,                                parseResponse: async res => res.text() },
      { name: 'ThingProxy FB',     formatUrl: url => `https://thingproxy.freeboard.io/fetch/${url}`,                       parseResponse: async res => res.text() },
      { name: 'ThingProxy PW',     formatUrl: url => `https://thingproxy.pw/fetch/${url}`,                                 parseResponse: async res => res.text() },
      { name: 'CORSProxy.io',      formatUrl: url => `https://corsproxy.io/?${url}`,                                     parseResponse: async res => res.text() },
      { name: 'CORS.bridged.cc',   formatUrl: url => `https://cors.bridged.cc/${url}`,                                    parseResponse: async res => res.text() },
      { name: 'YACDN',             formatUrl: url => `https://yacdn.org/proxy/${url}`,                                    parseResponse: async res => res.text() },
      { name: 'JSONP afeld',       formatUrl: url => `https://jsonp.afeld.me/?url=${encodeURIComponent(url)}`,          parseResponse: async res => (await res.json()).contents },
      { name: 'CORS Proxy HTML',   formatUrl: url => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(url)}`, parseResponse: async res => res.text() },
      { name: 'AllOrigins .net',   formatUrl: url => `https://api.allorigins.net/raw?url=${encodeURIComponent(url)}`,               parseResponse: async res => res.text() },
      { name: 'AllOrigins .io',    formatUrl: url => `https://api.allorigins.io/raw?url=${encodeURIComponent(url)}`,                parseResponse: async res => res.text() },
      { name: 'AllOrigins .eu',    formatUrl: url => `https://api.allorigins.eu/raw?url=${encodeURIComponent(url)}`,                parseResponse: async res => res.text() },
      { name: 'ProxyCORS',         formatUrl: url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,           parseResponse: async res => res.text() },
      { name: 'RainDrop CORS',     formatUrl: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,                parseResponse: async res => res.text() },
      { name: 'DirectNoCORS',      formatUrl: url => url,                                                                parseResponse: async res => {
                                                                                                          const text = await res.text().catch(()=> '');
                                                                                                          return text;
                                                                                                        }, options: { mode: 'no-cors' } },
      { name: 'FinalFallback',     formatUrl: url => url,                                                                parseResponse: async res => res.text() }
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
     * Performs a DuckDuckGo HTML search via proxies, paging to return up to `numResults` items (default 25).
     * @param {string} query
     * @param {number} [numResults=25]
     * @returns {Promise<Array<{title:string,url:string,snippet:string}>>}
     */
    async function webSearch(query, numResults = 25) {
      const pageSize = 10;
      const pages = Math.ceil(numResults / pageSize);
      const combined = [];
      for (let page = 0; page < pages; page++) {
        const offset = page * pageSize;
        // DuckDuckGo HTML interface uses 's' for start offset
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${offset}`;
        let pageResults = null;
        for (const proxy of proxies) {
          try {
            const fetchOptions = proxy.options || {};
            const response = await fetch(proxy.formatUrl(ddgUrl), fetchOptions);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const htmlString = await proxy.parseResponse(response);
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const container = doc.getElementById('links');
            if (!container) throw new Error('No results container');
            const items = container.querySelectorAll('div.result');
            if (!items.length) throw new Error('No results');

            pageResults = [];
            items.forEach(item => {
              const anchor = item.querySelector('a.result__a');
              if (!anchor) return;
              const href = getFinalUrl(anchor.href);
              const title = anchor.textContent.trim();
              const snippetElem = item.querySelector('a.result__snippet, div.result__snippet');
              const snippet = snippetElem ? snippetElem.textContent.trim() : '';
              pageResults.push({ title, url: href, snippet });
            });
            break;
          } catch (err) {
            console.warn(`Proxy ${proxy.name} failed: ${err.message}`);
          }
        }
        if (!pageResults) {
          throw new Error('All proxies failed for page ' + page);
        }
        combined.push(...pageResults);
        if (combined.length >= numResults) break;
      }
      return combined.slice(0, numResults);
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

    /**
     * Fetches Instant Answer from DuckDuckGo API.
     * @param {string} query - The search query.
     * @returns {Promise<Object>} - The JSON response from DuckDuckGo Instant Answer API.
     */
    async function instantAnswer(query) {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Instant Answer API error ${response.status}`);
      return response.json();
    }

    return { webSearch, readUrl, instantAnswer };
})(); 