// Normalisation shared by the build (indexing) and the browser (querying) for the full-text search.
// Both sides MUST tokenize the same way, otherwise a query word never meets its posting list.

/** Very frequent words left out of the index; a query drops them too. */
export const STOP = new Set(['من', 'في', 'علي', 'الي', 'عن', 'ان', 'او', 'ما', 'لا', 'ثم', 'قال', 'قالت', 'قالوا', 'كان', 'كانت', 'الله', 'رسول', 'النبي', 'صلي', 'عليه', 'وسلم', 'يا', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'الذي', 'التي', 'به', 'له', 'لها', 'لهم', 'بها', 'فيه', 'فيها', 'عليها', 'عليهم', 'اذا', 'اذ', 'حتي', 'كل', 'بن', 'ابن', 'ابو', 'ابي', 'انه', 'انها', 'اني', 'انا', 'نحن', 'هم', 'كما', 'لم', 'لن', 'قد', 'ولا', 'وما', 'فلا', 'اما', 'انما', 'الا', 'بل', 'مع', 'عند', 'بين', 'حين', 'يوم', 'ليله', 'رجل', 'ناس', 'شيء', 'فقال', 'فقالت', 'وقال', 'قلت', 'يقول', 'كانوا', 'كنا', 'كنت', 'وهو', 'وهي', 'وان', 'فان', 'ولم', 'فلم', 'حديث', 'رضي', 'عنه', 'عنها', 'حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'سمعت', 'قالا', 'وحدثنا', 'وحدثني', 'واخبرنا']);

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Lower an Arabic text to plain letters: no diacritics, unified alef/ya/ta marbuta, no punctuation. */
export function normalizeText(s) {
  return (s || '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي0-9a-zA-Z]+/g, ' ') // anything that is not a letter or a digit separates words
    .trim()
    .replace(/\s+/g, ' ');
}

/** Words of a text, normalized, without the stop words and the one-letter tokens. */
export function tokenize(s) {
  return normalizeText(s).split(' ').filter(w => w.length >= 2 && !STOP.has(w));
}

/** Light stemming: one prefix (و/ف/ب/ل/ك/س/ال…) and one suffix. */
export const stem = w => w.replace(/^(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك|س)(?=..)/, '').replace(/(?:ها|هم|هن|كم|كن|نا|ون|ين|ات|ان|ه|ي|ك|ت)$/, '');

/** Shard of a word: its first letter, or the first two letters after an alef (too frequent alone). */
export const shardKey = w => w[0] === 'ا' && w.length > 1 ? w.slice(0, 2) : w[0];
