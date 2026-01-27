const NodeCache = require('node-cache');

const cache = new NodeCache({
    stdTTL: 600
});

class StorytelProvider {
    constructor() {
        this.baseSearchUrl = 'https://www.storytel.com/api/search.action';
        this.baseBookUrl = 'https://www.storytel.com/api/getBookInfoForContent.action';
        this.locale = 'en';
    }

    /**
     * Sets the locale for the provider
     * @param locale {string} The locale to set
     */
    setLocale(locale) {
        this.locale = locale;
    }

    /**
     * Ensures a value is a string and trims it. Used for cleaning up data and returns
     * @param value
     * @returns {string}
     */
    ensureString(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim();
    }

    /**
     * Upgrades the cover URL to a higher resolution
     * @param url
     * @returns {undefined|string}
     */
    upgradeCoverUrl(url) {
        if (!url) return undefined;
        return `https://storytel.com${url.replace('320x320', '640x640')}`;
    }

    /**
     * Splits a genre by / or , and trims the resulting strings
     * @param genre {string}
     * @returns {*[]}
     */
    splitGenre(genre) {
        if (!genre) return [];
        return genre.split(/[\/,]/).map(g => {
            const trimmedGenre = g.trim();
            return trimmedGenre === 'Sci-Fi' ? 'Science-Fiction' : trimmedGenre;
        });
    }

    /**
     * Escapes special characters in RegEx patterns
     * @param str {string} String to escape
     * @returns {string}
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Formats the book metadata to the ABS format
     * @param bookData
     * @returns {{title: (string|string), subtitle: *, author: (string|string), language: (string|string), genres: (*[]|undefined), tags: undefined, series: null, cover: string, duration: (number|undefined), narrator: (*|undefined), description: (string|string), publisher: (string|string), publishedYear: string | undefined, isbn: (string|string)}|null}
     */
    formatBookMetadata(bookData) {
        const slb = bookData.slb;
        if (!slb || !slb.book) return null;

        const book = slb.book;
        const abook = slb.abook;
        const ebook = slb.ebook;

        if (!abook && !ebook) return null;

        let seriesInfo = null;
        let seriesName = null;
        if (book.series && book.series.length > 0 && book.seriesOrder) {
            seriesName = book.series[0].name;
            seriesInfo = [{
                series: this.ensureString(seriesName),
                sequence: this.ensureString(book.seriesOrder)
            }];
        }

        const author = this.ensureString(book.authorsAsString);

        let title = book.name;
        let subtitle = null;

        // These patterns match various series and volume indicators across different languages
        // Current Patterns for all Storytel regions
        const patterns = [

            // Belgium / Netherlands
            /^.*?,\s*Aflevering\s*\d+:\s*/i,      // Dutch: "Aflevering" (Episode)
            /^.*?,\s*Deel\s*\d+:\s*/i,            // Dutch: "Deel" (Part)

            // Brazil
            /^.*?,\s*Episódio\s*\d+:\s*/i,        // Portuguese: "Episódio" (Episode)
            /^.*?,\s*Parte\s*\d+:\s*/i,           // Portuguese: "Parte" (Part)

            // Bulgaria
            /^.*?,\s*епизод\s*\d+:\s*/i,          // Bulgarian: "епизод" (Episode)
            /^.*?,\s*том\s*\d+:\s*/i,             // Bulgarian: "том" (Volume)
            /^.*?,\s*част\s*\d+:\s*/i,            // Bulgarian: "част" (Part)

            // Colombia / Spain
            /^.*?,\s*Episodio\s*\d+:\s*/i,        // Spanish: "Episodio" (Episode)
            /^.*?,\s*Volumen\s*\d+:\s*/i,         // Spanish: "Volumen" (Volume)

            // Denmark
            /^.*?,\s*Afsnit\s*\d+:\s*/i,          // Danish: "Afsnit" (Episode)
            /^.*?,\s*Bind\s*\d+:\s*/i,            // Danish: "Bind" (Volume)
            /^.*?,\s*Del\s*\d+:\s*/i,             // Danish: "Del" (Part)

            // Egypt / Saudi Arabia / United Arab Emirates
            /^.*?,\s*حلقة\s*\d+:\s*/i,            // Arabic: "حلقة" (Episode)
            /^.*?,\s*مجلد\s*\d+:\s*/i,            // Arabic: "مجلد" (Volume)
            /^.*?,\s*جزء\s*\d+:\s*/i,             // Arabic: "جزء" (Part)

            // Finland
            /^.*?,\s*Jakso\s*\d+:\s*/i,           // Finnish: "Jakso" (Episode)
            /^.*?,\s*Volyymi\s*\d+:\s*/i,         // Finnish: "Volyymi" (Volume)
            /^.*?,\s*Osa\s*\d+:\s*/i,             // Finnish: "Osa" (Part)

            // France
            /^.*?,\s*Épisode\s*\d+:\s*/i,         // French: "Épisode" (Episode)
            /^.*?,\s*Tome\s*\d+:\s*/i,            // French: "Tome" (Volume)
            /^.*?,\s*Partie\s*\d+:\s*/i,          // French: "Partie" (Part)

            // Indonesia
            /^.*?,\s*Episode\s*\d+:\s*/i,         // Indonesian: "Episode"
            /^.*?,\s*Bagian\s*\d+:\s*/i,          // Indonesian: "Bagian" (Part)

            // Israel
            /^.*?,\s*פרק\s*\d+:\s*/i,             // Hebrew: "פרק" (Chapter)
            /^.*?,\s*כרך\s*\d+:\s*/i,             // Hebrew: "כרך" (Volume)
            /^.*?,\s*חלק\s*\d+:\s*/i,             // Hebrew: "חלק" (Part)

            // India
            /^.*?,\s*कड़ी\s*\d+:\s*/i,             // Hindi: "कड़ी" (Episode)
            /^.*?,\s*खण्ड\s*\d+:\s*/i,            // Hindi: "खण्ड" (Volume)
            /^.*?,\s*भाग\s*\d+:\s*/i,             // Hindi: "भाग" (Part)

            // Iceland
            /^.*?,\s*Þáttur\s*\d+:\s*/i,          // Icelandic: "Þáttur" (Episode)
            /^.*?,\s*Bindi\s*\d+:\s*/i,           // Icelandic: "Bindi" (Volume)
            /^.*?,\s*Hluti\s*\d+:\s*/i,           // Icelandic: "Hluti" (Part)

            // Poland
            /^.*?,\s*Odcinek\s*\d+:\s*/i,         // Polish: "Odcinek" (Episode)
            /^.*?,\s*Tom\s*\d+:\s*/i,             // Polish: "Tom" (Volume)
            /^.*?,\s*Część\s*\d+:\s*/i,           // Polish: "Część" (Part)

            // Sweden
            /^.*?,\s*Avsnitt\s*\d+:\s*/i,         // Swedish: "Avsnitt" (Episode)
        ];

        // Additional German patterns for special cases
        const germanPatterns = [
            /^.*?,\s*Folge\s*\d+:\s*/i,           // "Folge" (Episode)
            /^.*?,\s*Band\s*\d+:\s*/i,            // "Band" (Volume)
            /^.*?\s+-\s+\d+:\s*/i,                // Title - 1: format
            /^.*?\s+\d+:\s*/i,                    // Title 1: format
            /^.*?,\s*Teil\s*\d+:\s*/i,            // "Teil" (Part)
            /^.*?,\s*Volume\s*\d+:\s*/i,          // "Volume"
            /\s*\((Ungekürzt|Gekürzt)\)\s*$/i,    // (Unabridged/Abridged)
            /,\s*Teil\s+\d+$/i,                   // ", Teil X" at end
            /-\s*.*?(?:Reihe|Serie)\s+\d+$/i      // "- Serie X" at end
        ];

        const allPatterns = [...patterns, ...germanPatterns];

        // Clean up the title by removing all pattern matches
        allPatterns.forEach(pattern => {
            title = title.replace(pattern, '');
        });

        if (seriesInfo) {
            subtitle = `${seriesName} ${book.seriesOrder}`;

            // Removes series from title name
            if (title.includes(seriesName)) {
                const safeSeriesName = this.escapeRegex(seriesName);
                const regex = new RegExp(`^(.+?)[-,]\\s*${safeSeriesName}`, 'i');

                const beforeSeriesMatch = title.match(regex);
                if (beforeSeriesMatch) {
                    title = beforeSeriesMatch[1].trim();
                }

                title = title.replace(seriesName, '');
            }
        }

        // Check if there is a subtitle (separated by : or -)
        if (title.includes(':') || title.includes('-')) {
            const parts = title.split(/[:\-]/);
            if (parts[1] && parts[1].trim().length >= 3) {
                title = parts[0].trim();
                subtitle = parts[1].trim();
            }
        }

        // Final cleanup of title
        allPatterns.forEach(pattern => {
            title = title.replace(pattern, '');
        });

        title = title.trim();
        if (subtitle) {
            subtitle = subtitle.trim();
        }

        const genres = book.category
            ? this.splitGenre(this.ensureString(book.category.title))
            : [];

        const metadata = {
            title: this.ensureString(title),
            subtitle: subtitle,
            author: author,
            language: this.ensureString(book.language?.isoValue || this.locale),
            genres: genres.length > 0 ? genres : undefined,
            series: seriesInfo,
            cover: this.upgradeCoverUrl(book.largeCover),
            duration: abook ? (abook.length ? Math.floor(abook.length / 60000) : undefined) : undefined,
            narrator: abook ? abook.narratorAsString || undefined : undefined,
            description: this.ensureString(abook ? abook.description : ebook?.description),
            publisher: this.ensureString(abook ? abook.publisher?.name : ebook?.publisher?.name),
            publishedYear: (abook ? abook.releaseDateFormat : ebook?.releaseDateFormat)?.substring(0, 4),
            isbn: this.ensureString(abook ? abook.isbn : ebook?.isbn)
        };

        // Remove undefined values
        Object.keys(metadata).forEach(key =>
            metadata[key] === undefined && delete metadata[key]
        );

        return metadata;
    }

    /**
     * Searches for books in the Storytel API
     * @param query {string} Search query
     * @param author {string} Optional author filter
     * @param locale {string} Locale for the search
     * @returns {Promise<{matches: *[]}>}
     */
    async searchBooks(query, author = '', locale) {
        const cleanQuery = query.split(':')[0].trim();
        const formattedQuery = cleanQuery.replace(/\s+/g, '+');

        const cacheKey = `${formattedQuery}-${author}-${locale}`;

        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }
        console.log(`searchBooks: ${formattedQuery}, ${locale}`);

        try {
            const body = new URLSearchParams();
            body.append("q", formattedQuery);
            body.append("request_locale", locale);

            const searchResponse = await fetch(this.baseSearchUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
              },
              body: body.toString(),
            });

            const text = await searchResponse.text();
            let data;

            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("Invalid JSON from Storytel search:", text.slice(0, 200));
                return { matches: [] };
            }

            // ✅ replicate axios behavior
            if (!data || !data.books) {
                return { matches: [] };
            }

            const books = data.books.slice(0, 10);
            console.log(`Found ${books.length} books in search results`);

            const matches = await Promise.all(books.map(async book => {
                if (!book.book || !book.book.id) return null;
                const bookDetails = await this.getBookDetails(book.book.id, locale);
                if (!bookDetails) return null;

                return this.formatBookMetadata(bookDetails);
            }));

            const validMatches = matches.filter(match => match !== null);

            const result = { matches: validMatches };
            cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Error searching books:', error.message);
            return { matches: [] };
        }
    }

    async fetchBookInfo(bookId, locale, paramName) {
        try {
            console.log(`fetchBookDetails: ${bookId}, ${locale}, ${paramName}`);
            
            const body = new URLSearchParams();
            body.append(paramName, bookId);
            body.append("request_locale", locale);

            const response = await fetch(this.baseBookUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent":
                  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
              },
              body: body.toString(),
            });

            const text = await response.text(); // debug raw response first
            // console.log("RAW RESPONSE:", text.slice(0, 500));
            const json = JSON.parse(text);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return json;
        } catch (error) {
            console.error("Fetch error:", error.message);
            return null;
        }
    }
    
    /**
    * Gets detailed book information from Storytel API
    * @param bookId {string|number} The book ID to fetch details for
    * @param locale {string} Locale for the request
    * @returns {Promise<*>}
    */
    async getBookDetails(bookId, locale) {
        // 1) Try with bookId
        let data = await this.fetchBookInfo(bookId, locale, "bookId");

        if (data?.result === "success") {
            return data;
        }

        console.log(`Retrying with consumableId for ID ${bookId}...`);

        // 2) Retry with consumableId
        data = await this.fetchBookInfo(bookId, locale, "consumableId");

        if (data?.result === "success") {
            return data;
        }

        // 3) Final failure
        throw new Error( `Storytel API failed for ID ${bookId}. Result: ${data?.result}`);
    }
}

module.exports = StorytelProvider;
