/// <reference path="./_external/.onlinestream-provider.d.ts" />
/// <reference path="./_external/core.d.ts" />

// ===================================================================
// Extension VoirAnime pour Seanime - VERSION ULTRA FIABLE
// ===================================================================
// Site : https://v6.voiranime.com
// Auteur : Xiu991
// Inspiré de : Anicrush (structure), Anime-Sama (parsing)
// ===================================================================

class Provider {
    private readonly SITE_URL = "https://v6.voiranime.com";
    private readonly SEARCH_URL = "https://v6.voiranime.com";

    getSettings(): Settings {
        return {
            episodeServers: [
                "voe",
                "doodstream", 
                "streamtape",
                "mixdrop",
                "upstream",
                "vidoza"
            ],
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        console.log(`🔍 Recherche pour: "${opts.query}"`);
        
        try {
            const normalizedQuery = this.normalizeQuery(opts.query);
            console.log(`📝 Requête normalisée: "${normalizedQuery}"`);
            
            // VoirAnime: recherche via GET parameter
            const searchUrl = `${this.SEARCH_URL}/?s=${encodeURIComponent(normalizedQuery)}`;
            console.log(`🔗 URL: ${searchUrl}`);
            
            const html = await this.GETText(searchUrl);
            console.log(`✅ HTML reçu: ${html.length} caractères`);
            
            const $ = await LoadDoc(html);
            const results: SearchResult[] = [];
            
            // VoirAnime: Utiliser TOUS les liens et extraire info
            const allLinks = $("a[href*='/anime/'], a[href*='/series/'], a");
            console.log(`🔗 Tous les liens: ${allLinks.length()}`);
            
            const seenUrls = new Set<string>();
            
            for (let i = 0; i < allLinks.length(); i++) {
                const link = allLinks.eq(i);
                const url = link.attr("href");
                
                if (!url) continue;
                
                // Filtrer seulement les liens d'anime
                if (!url.includes('/anime/') && !url.includes('/series/') && !url.includes('/watch/')) {
                    continue;
                }
                
                // Éviter doublons
                if (seenUrls.has(url)) continue;
                seenUrls.add(url);
                
                // Extraire titre (plusieurs sources)
                const title = link.attr("title") || 
                             link.find("h2, h3").text().trim() ||
                             link.text().trim();
                
                if (!title || title.length < 2) continue;
                
                console.log(`📺 [${i}] "${title}" -> ${url}`);
                
                // Score de correspondance avec seuil PLUS BAS
                const matchScore = this.calculateMatchScore(title, normalizedQuery);
                
                // SEUIL ABAISSÉ à 0.2 au lieu de 0.3
                if (matchScore > 0.2) {
                    const fullUrl = url.startsWith('http') ? url : this.SITE_URL + url;
                    
                    results.push({
                        id: `${fullUrl}?dub=${opts.dub}`,
                        title: title,
                        url: fullUrl,
                        subOrDub: opts.dub ? "dub" : "sub",
                    });
                    
                    console.log(`✨ Match (score: ${matchScore.toFixed(2)})`);
                }
            }
            
            // Trier par pertinence
            results.sort((a, b) => {
                const scoreA = this.calculateMatchScore(a.title, normalizedQuery);
                const scoreB = this.calculateMatchScore(b.title, normalizedQuery);
                return scoreB - scoreA;
            });
            
            console.log(`🎉 Total: ${results.length} résultat(s)`);
            return results.slice(0, 10);
            
        } catch (error) {
            console.error("❌ Erreur recherche:", error);
            return [];
        }
    }

    async findEpisodes(Id: string): Promise<EpisodeDetails[]> {
        const [id, dubParam] = Id.split("?dub=");
        const isDub = dubParam === "true";
        
        console.log(`📺 Episodes pour: ${id} (${isDub ? "VF" : "VOSTFR"})`);
        
        try {
            const html = await this.GETText(id);
            console.log(`✅ Page chargée: ${html.length} caractères`);
            
            const $ = await LoadDoc(html);
            const episodes: EpisodeDetails[] = [];
            
            // Méthode 1: Liste d'épisodes standard
            const episodeLinks = $("div.episodelist a, ul.episodelist a, div.episodes a");
            console.log(`📋 Méthode 1 - Episodes links: ${episodeLinks.length()}`);
            
            for (let i = 0; i < episodeLinks.length(); i++) {
                const link = episodeLinks.eq(i);
                const href = link.attr("href");
                const text = link.text().trim();
                
                if (!href) continue;
                
                // Extraire numéro
                const epMatch = text.match(/(?:épisode|episode|ep\.?)\s*(\d+)/i) ||
                               href.match(/episode[-_](\d+)/i);
                
                const number = epMatch ? parseInt(epMatch[1], 10) : i + 1;
                const fullUrl = href.startsWith('http') ? href : this.SITE_URL + href;
                
                episodes.push({
                    id: `${fullUrl}?dub=${isDub}`,
                    number: number,
                    url: fullUrl,
                    title: text || `Episode ${number}`
                });
            }
            
            // Méthode 2: Boutons épisodes
            if (episodes.length === 0) {
                console.log(`⚠️ Méthode 2 - Boutons épisodes`);
                const buttons = $("button[data-episode], a[data-episode]");
                
                for (let i = 0; i < buttons.length(); i++) {
                    const btn = buttons.eq(i);
                    const epNum = parseInt(btn.attr("data-episode") || `${i + 1}`);
                    const epUrl = btn.attr("data-url") || btn.attr("href") || `${id}/episode-${epNum}`;
                    
                    episodes.push({
                        id: `${epUrl}?dub=${isDub}`,
                        number: epNum,
                        url: epUrl,
                    });
                }
            }
            
            // Méthode 3: Parser scripts
            if (episodes.length === 0) {
                console.log(`⚠️ Méthode 3 - Scripts`);
                const scripts = $("script");
                
                for (let i = 0; i < scripts.length(); i++) {
                    const content = scripts.eq(i).html();
                    if (!content || !content.includes("episode")) continue;
                    
                    // Chercher patterns JSON
                    const jsonMatch = content.match(/episodes\s*[:=]\s*(\[[\s\S]*?\])/);
                    if (jsonMatch) {
                        try {
                            const eps = JSON.parse(jsonMatch[1]);
                            eps.forEach((ep: any) => {
                                episodes.push({
                                    id: `${ep.url || `${id}/episode-${ep.number}`}?dub=${isDub}`,
                                    number: parseInt(ep.number || ep.episode),
                                    url: ep.url || `${id}/episode-${ep.number}`,
                                });
                            });
                        } catch (e) {
                            console.error("❌ Parse JSON:", e);
                        }
                    }
                }
            }
            
            // Dédupliquer et trier
            const unique = Array.from(new Map(
                episodes.map(ep => [ep.number, ep])
            ).values());
            
            unique.sort((a, b) => a.number - b.number);
            
            console.log(`✅ Total: ${unique.length} épisode(s)`);
            return unique;
            
        } catch (error) {
            console.error("❌ Erreur episodes:", error);
            return [];
        }
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const [epUrl, dubParam] = episode.id.split("?dub=");
        
        console.log(`🎬 Episode ${episode.number} - Serveur: ${_server}`);
        
        try {
            const html = await this.GETText(epUrl);
            const $ = await LoadDoc(html);
            
            let serverUrl: string | undefined;
            
            // Méthode 1: Iframe du serveur
            const iframes = $("iframe");
            console.log(`🎥 Iframes: ${iframes.length()}`);
            
            for (let i = 0; i < iframes.length(); i++) {
                const src = iframes.eq(i).attr("src");
                if (src && this.isVideoServer(src, _server)) {
                    serverUrl = src;
                    console.log(`✅ Iframe match: ${src.substring(0, 50)}...`);
                    break;
                }
            }
            
            // Méthode 2: Boutons serveur
            if (!serverUrl) {
                const serverBtns = $(`[data-server*="${_server}"], button:contains("${_server}")`);
                if (serverBtns.length() > 0) {
                    serverUrl = serverBtns.first().attr("data-url") || 
                               serverBtns.first().attr("data-src");
                    console.log(`✅ Bouton serveur: ${serverUrl}`);
                }
            }
            
            // Méthode 3: Scripts
            if (!serverUrl) {
                const scripts = $("script");
                for (let i = 0; i < scripts.length(); i++) {
                    const content = scripts.eq(i).html();
                    if (!content) continue;
                    
                    if (content.includes(_server)) {
                        const urlMatch = content.match(/['"](https?:\/\/[^'"]+)['"]/g);
                        if (urlMatch) {
                            for (const match of urlMatch) {
                                const url = match.replace(/['"]/g, '');
                                if (this.isVideoServer(url, _server)) {
                                    serverUrl = url;
                                    console.log(`✅ Script match`);
                                    break;
                                }
                            }
                        }
                    }
                    if (serverUrl) break;
                }
            }
            
            if (!serverUrl) {
                console.error(`❌ Serveur ${_server} non trouvé`);
                throw new Error(`Serveur ${_server} non disponible`);
            }
            
            // Extraire sources vidéo
            const videoSources = await this.extractVideoSources(serverUrl, _server);
            
            if (videoSources.length === 0) {
                console.warn(`⚠️ Pas de sources, fallback iframe`);
                videoSources.push({
                    url: serverUrl,
                    type: "hls",
                    quality: "auto",
                    subtitles: []
                });
            }
            
            return {
                server: _server,
                headers: {
                    "Referer": epUrl.split("/").slice(0, 3).join("/"),
                    "Origin": this.SITE_URL,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                videoSources: videoSources
            };
            
        } catch (error) {
            console.error(`❌ Erreur serveur:`, error);
            throw new Error(`Impossible de charger ${_server}`);
        }
    }

    // === Méthodes utilitaires ===

    private normalizeQuery(query: string): string {
        return query
            .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
            .replace(/\s+/g, " ")
            .replace(/(\d+)\s*Season/i, "$1")
            .replace(/Season\s*(\d+)/i, "$1")
            .trim();
    }

    private calculateMatchScore(title: string, query: string): number {
        const normTitle = this.normalize(title);
        const normQuery = this.normalize(query);
        
        console.log(`🔍 Comparaison: "${normTitle}" vs "${normQuery}"`);
        
        // Exact match
        if (normTitle === normQuery) {
            console.log(`✅ Match exact!`);
            return 1.0;
        }
        
        // Contains
        if (normTitle.includes(normQuery)) {
            console.log(`✅ Contains (0.9)`);
            return 0.9;
        }
        
        if (normQuery.includes(normTitle)) {
            console.log(`✅ Reverse contains (0.8)`);
            return 0.8;
        }
        
        // Word match
        const titleWords = normTitle.split(' ').filter(w => w.length > 0);
        const queryWords = normQuery.split(' ').filter(w => w.length > 0);
        let matches = 0;
        
        for (const qWord of queryWords) {
            for (const tWord of titleWords) {
                if (tWord.includes(qWord) || qWord.includes(tWord)) {
                    matches++;
                    break;
                }
            }
        }
        
        const score = matches / queryWords.length;
        console.log(`📊 Score mots: ${matches}/${queryWords.length} = ${score.toFixed(2)}`);
        return score;
    }

    private normalize(str: string): string {
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    private async extractVideoSources(embedUrl: string, serverName: string): Promise<VideoSource[]> {
        try {
            console.log(`🔍 Extraction: ${embedUrl.substring(0, 50)}...`);
            
            const html = await this.GETText(embedUrl);
            const sources: VideoSource[] = [];
            
            // M3U8
            const m3u8Regex = /https?:\/\/[^\s'"<>]+\.m3u8(?:\?[^\s'"<>]*)?/g;
            const m3u8s = html.match(m3u8Regex);
            
            if (m3u8s) {
                for (const url of m3u8s) {
                    if (url.includes('master')) {
                        const qualities = await this.extractQualities(url);
                        if (qualities.length > 0) {
                            sources.push(...qualities.map(q => ({
                                url: q.url,
                                type: "hls" as VideoSourceType,
                                quality: q.quality,
                                subtitles: []
                            })));
                            continue;
                        }
                    }
                    
                    sources.push({
                        url: url,
                        type: "hls",
                        quality: "auto",
                        subtitles: []
                    });
                }
            }
            
            // MP4
            const mp4Regex = /https?:\/\/[^\s'"<>]+\.mp4(?:\?[^\s'"<>]*)?/g;
            const mp4s = html.match(mp4Regex);
            
            if (mp4s) {
                for (const url of mp4s) {
                    const quality = url.match(/(\d{3,4})p/)?.[1] + "p" || "auto";
                    sources.push({
                        url: url,
                        type: "mp4",
                        quality: quality,
                        subtitles: []
                    });
                }
            }
            
            console.log(`✅ ${sources.length} source(s)`);
            return sources;
            
        } catch (error) {
            console.error("❌ Extraction:", error);
            return [];
        }
    }

    private async extractQualities(masterUrl: string): Promise<{url: string, quality: string}[]> {
        try {
            const html = await this.GETText(masterUrl);
            if (!html.includes("#EXTM3U")) return [];
            
            const qualities: {url: string, quality: string}[] = [];
            const lines = html.split("\n");
            let currentQuality = "";
            
            for (const line of lines) {
                if (line.startsWith("#EXT-X-STREAM-INF")) {
                    const res = line.match(/RESOLUTION=\d+x(\d+)/);
                    if (res) {
                        const h = parseInt(res[1]);
                        currentQuality = h >= 1080 ? "1080p" :
                                        h >= 720 ? "720p" :
                                        h >= 480 ? "480p" : "360p";
                    }
                } else if (line.trim() && !line.startsWith("#")) {
                    let url = line.trim();
                    if (!url.startsWith("http")) {
                        const base = masterUrl.substring(0, masterUrl.lastIndexOf('/'));
                        url = `${base}/${url}`;
                    }
                    if (currentQuality) {
                        qualities.push({ url, quality: currentQuality });
                        currentQuality = "";
                    }
                }
            }
            
            return qualities;
        } catch {
            return [];
        }
    }

    private isVideoServer(url: string, serverName: string): boolean {
        const lower = url.toLowerCase();
        return lower.includes(serverName.toLowerCase()) ||
               this.getSettings().episodeServers.some(s => lower.includes(s.toLowerCase()));
    }

    private async GETText(url: string): Promise<string> {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9",
                "Referer": this.SITE_URL,
            },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.text();
    }
}
