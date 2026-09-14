import '../styles/glossary.css';
// highlight the entry pointed by the hash (glossary.html#jarh, glossary.html#term)
const h = decodeURIComponent(location.hash.slice(1));
if (h) document.getElementById(h)?.scrollIntoView();
