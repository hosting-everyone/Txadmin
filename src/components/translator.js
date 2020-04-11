//Requires
const modulename = 'Translator';
const fs = require('fs');
const Polyglot = require('node-polyglot');
const { dir, log, logOk, logWarn, logError} = require('../extras/console')(modulename);

const languages = {
    ar: require('../../locale/ar.json'),
    cs: require('../../locale/cs.json'),
    da: require('../../locale/da.json'),
    de: require('../../locale/de.json'),
    en: require('../../locale/en.json'),
    es: require('../../locale/es.json'),
    fi: require('../../locale/fi.json'),
    fr: require('../../locale/fr.json'),
    hu: require('../../locale/hu.json'),
    lv: require('../../locale/lv.json'),
    nl: require('../../locale/nl.json'),
    pl: require('../../locale/pl.json'),
    pt_BR: require('../../locale/pt_BR.json'),
    ro: require('../../locale/ro.json'),
    ru: require('../../locale/ru.json'),
    th: require('../../locale/th.json'),
    tr: require('../../locale/tr.json'),
    zh: require('../../locale/zh.json'),
};

/**
 * Small translation module built around Polyglot.js.
 * For the future, its probably a good idea to upgrade to i18next
 */
module.exports = class Translator {
    constructor() {
        logOk('Started');
        this.language = globals.config.language;
        this.polyglot = null;

        //Load language
        try {
            let phrases = this.getLanguagePhrases(this.language);
            let polyglotOptions = {
                allowMissing: false,
                onMissingKey: (key)=>{
                    logError(`Missing key '${key}' from translation file.`, 'Translator')
                    return key;
                },
                phrases
            }
            this.polyglot = new Polyglot(polyglotOptions);
        } catch (error) {
            logError(error.message);
            process.exit();
        }
    }


    //================================================================
    /**
     * Refresh translator configurations
     * @param {string} phrases
     */
    refreshConfig(phrases){
        //Load language
        try {
            let polyglotOptions = {
                allowMissing: false,
                onMissingKey: (key)=>{
                    logError(`Missing key '${key}' from translation file.`, 'Translator')
                    return key;
                },
                phrases
            }
            this.polyglot = new Polyglot(polyglotOptions);
        } catch (error) {
            logError(error.message);
            process.exit();
        }

        //Rebuild Monitor's schedule with new text
        try {
            globals.monitor.buildSchedule();
        } catch (error) {}
    }


    //================================================================
    /**
     * Loads a language file or throws Error.
     * NOTE: hash "protection" removed since the main distribution method will be webpack
     * 
     * @param {string} lang
     */
    getLanguagePhrases(lang){
        //If its a default language
        if(typeof languages[lang] === 'object') return languages[lang];

        //If its a custom language
        try {
            return JSON.parse(fs.readFileSync(
                `${GlobalData.dataPath}/locale/${lang}.json`,
                'utf8'
            ));
        } catch (error) {
            throw new Error(`Failed to load 'locale/${lang}.json'. (${error.message})`);
        }
    }


    //================================================================
    /**
     * Perform a translation (polyglot.t)
     * @param {string} key
     * @param {object} options
     */
    t(key, options){
        if(typeof options === 'undefined') options = {};
        try {
            return this.polyglot.t(key, options);
        } catch (error) {
            logError(`Error performing a translation with key '${key}'`);
            return key;
        }
    }

} //Fim Translator()
