const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/database');
const axios = require('axios'); // Add axios for API calls
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', require('./routes/auth'));

// Open Source Knowledge Base Integration
class OpenSourceDialectBase {
    constructor() {
        this.supportedLanguages = {
            'tamil': 'ta',
            'telugu': 'te', 
            'hindi': 'hi',
            'tulu': 'tcy', // Tulu language code
            'kannada': 'kn',
            'malayalam': 'ml',
            'bengali': 'bn'
        };
        
        // Fallback basic dictionary for common words
        this.fallbackDictionary = {
            'tamil': {
                'vanakkam': 'Hello/Welcome',
                'nandri': 'Thank you',
                'sugam': 'Well/Good'
            },
            'telugu': {
                'namaskaram': 'Hello',
                'dhanyavaadhamulu': 'Thank you',
                'bagunnana': 'How are you?'
            },
            'hindi': {
                'namaste': 'Hello',
                'dhanyavaad': 'Thank you',
                'kaise ho': 'How are you?'
            },
            'tulu': {
                'yenna': 'What',
                'aanda': 'Yes',
                'porluga': 'Good'
            }
        };
    }

    // Method 1: Wiktionary API (Free and open-source)
    async searchWiktionary(word, language) {
        try {
            const langCode = this.supportedLanguages[language.toLowerCase()];
            if (!langCode) {
                throw new Error('Language not supported');
            }

            const response = await axios.get(
                `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );

            if (response.data && response.data[langCode]) {
                const definitions = response.data[langCode];
                const meaning = definitions[0].definitions[0].definition;
                return {
                    source: 'wiktionary',
                    meaning: meaning,
                    language: language,
                    word: word
                };
            }
            throw new Error('Word not found in Wiktionary');
        } catch (error) {
            console.log('Wiktionary API failed, trying fallback...');
            return this.searchFallback(word, language);
        }
    }

    // Method 2: FreeDictionary API (Backup)
    async searchFreeDictionary(word, language) {
        try {
            // FreeDictionary doesn't support Indian languages well, so we'll use English translations
            const response = await axios.get(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );

            if (response.data && response.data[0]) {
                const meaning = response.data[0].meanings[0].definitions[0].definition;
                return {
                    source: 'freedictionary',
                    meaning: meaning,
                    language: 'english', // Returns English definition
                    originalWord: word,
                    note: 'Translated via English dictionary'
                };
            }
            throw new Error('Word not found in FreeDictionary');
        } catch (error) {
            console.log('FreeDictionary API failed, trying fallback...');
            return this.searchFallback(word, language);
        }
    }

    // Method 3: Local fallback dictionary
    searchFallback(word, language) {
        const langData = this.fallbackDictionary[language.toLowerCase()];
        if (langData && langData[word.toLowerCase()]) {
            return {
                source: 'fallback',
                meaning: langData[word.toLowerCase()],
                language: language,
                word: word,
                note: 'From local dictionary (limited words)'
            };
        }
        
        throw new Error(`Word "${word}" not found in any knowledge base for ${language}`);
    }

    // Main search method that tries multiple sources
    async searchWord(word, language) {
        // First try Wiktionary
        try {
            return await this.searchWiktionary(word, language);
        } catch (error) {
            console.log('Wiktionary failed:', error.message);
        }

        // Then try FreeDictionary (for English context)
        try {
            return await this.searchFreeDictionary(word, language);
        } catch (error) {
            console.log('FreeDictionary failed:', error.message);
        }

        // Finally try fallback
        try {
            return await this.searchFallback(word, language);
        } catch (error) {
            throw new Error(`No definition found for "${word}" in ${language}. The word might be misspelled or not in our databases.`);
        }
    }
}

// Initialize the knowledge base
const dialectBase = new OpenSourceDialectBase();

// Enhanced Search endpoint with open-source knowledge base
app.post('/api/search', async (req, res) => {
    try {
        const { word, language, token } = req.body;
        
        // Validate input
        if (!word || !language) {
            return res.status(400).json({
                status: 'error',
                message: 'Word and language are required'
            });
        }

        let user = null;
        const User = require('./models/User');
        
        // Process with or without token
        const processRequest = async () => {
            // First, check if language is supported
            if (!dialectBase.supportedLanguages[language.toLowerCase()]) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Language not supported. Supported languages: ' + 
                             Object.keys(dialectBase.supportedLanguages).join(', ')
                });
            }

            // Search in open-source knowledge base
            let searchResult;
            try {
                searchResult = await dialectBase.searchWord(word, language);
            } catch (searchError) {
                return res.status(404).json({
                    status: 'error',
                    message: searchError.message
                });
            }

            // If no token, return result immediately
            if (!token) {
                return res.json({
                    status: 'success',
                    data: {
                        word,
                        language,
                        meaning: searchResult.meaning,
                        source: searchResult.source,
                        note: searchResult.note || '',
                        searchesLeft: null
                    }
                });
            }

            // If token exists, verify and check search limits
            const jwt = require('jsonwebtoken');
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (err) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token'
                });
            }

            User.findById(decoded.id, (err, userData) => {
                if (err || !userData) {
                    return res.status(401).json({
                        status: 'error',
                        message: 'User not found'
                    });
                }

                user = userData;
                
                User.canSearch(user, (err, canSearch) => {
                    if (err) {
                        return res.status(500).json({
                            status: 'error',
                            message: 'Database error'
                        });
                    }
                    
                    if (!canSearch) {
                        return res.status(403).json({
                            status: 'error',
                            message: 'Free search limit reached. Upgrade to premium.'
                        });
                    }

                    // User can search, update search count if free user
                    if (user.subscription === 'free') {
                        const newSearches = user.searchesThisWeek + 1;
                        User.updateSearches(user.id, newSearches, (err) => {
                            if (err) {
                                console.error('Error updating search count:', err);
                            }
                            
                            res.json({
                                status: 'success',
                                data: {
                                    word,
                                    language,
                                    meaning: searchResult.meaning,
                                    source: searchResult.source,
                                    note: searchResult.note || '',
                                    searchesLeft: 10 - newSearches
                                }
                            });
                        });
                    } else {
                        // Premium user - no limit
                        res.json({
                            status: 'success',
                            data: {
                                word,
                                language,
                                meaning: searchResult.meaning,
                                source: searchResult.source,
                                note: searchResult.note || '',
                                searchesLeft: 'unlimited'
                            }
                        });
                    }
                });
            });
        };

        await processRequest();
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// New endpoint to get supported languages
app.get('/api/languages', (req, res) => {
    res.json({
        status: 'success',
        data: Object.keys(dialectBase.supportedLanguages)
    });
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Test endpoint with knowledge base check
app.get('/api/test', async (req, res) => {
    try {
        // Test the knowledge base with a common word
        const testResult = await dialectBase.searchWord('vanakkam', 'tamil');
        
        res.json({ 
            status: 'success', 
            message: 'Server is running with Open Source Knowledge Base!',
            knowledgeBaseTest: testResult,
            supportedLanguages: Object.keys(dialectBase.supportedLanguages),
            features: [
                'Wiktionary API Integration',
                'FreeDictionary API Fallback', 
                'Local Dictionary Backup',
                'Multi-source Search'
            ]
        });
    } catch (error) {
        res.json({
            status: 'success',
            message: 'Server running (knowledge base test failed)',
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
    console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
    console.log(`Supported languages: ${Object.keys(dialectBase.supportedLanguages).join(', ')}`);
});