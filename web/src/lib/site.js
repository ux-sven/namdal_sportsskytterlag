import content from '../data/content.json';

export const site = {
  name: 'Namdal Sportsskytterlag',
  short: 'NSSL',
  description:
    'Skytterklubb i Namdalen med baneskyting (25 meter), feltpistol og dynamisk sportsskyting med pistol, rifle og PCC.',
  email: 'namdalssl@gmail.com',
  facebook: 'https://www.facebook.com/NamdalSportsskytterlag',
  address: ['Granheimvegen 1', '7803 Namsos'],
  // Lenke til den publiserte Apps Script-appen for oppmøteregistrering.
  registrationUrl: import.meta.env.PUBLIC_REGISTRATION_URL || '',
};

export const nav = [
  { label: 'Nyheter', href: '/nyheter/' },
  {
    label: 'Aktiviteter',
    href: '/kalender/',
    children: [
      { label: 'Aktivitetskalender', href: '/kalender/' },
      { label: 'Sikkerhetskurs', href: '/sikkerhetskurs/' },
      { label: 'Dokumenter og skjema', href: '/dokumenter/' },
    ],
  },
  {
    label: 'Skytesporter',
    href: '/vare-skytesporter/',
    children: [
      { label: 'Våre skytesporter', href: '/vare-skytesporter/' },
      { label: 'Dynamisk sportsskyting', href: '/dynamisk-sportsskyting/' },
      { label: 'Norges Sportsskytterforbund', href: '/norges-sportsskytterforbund/' },
    ],
  },
  {
    label: 'Om oss',
    href: '/om-2/',
    children: [
      { label: 'Om NSSL', href: '/om-2/' },
      { label: 'Øysletta skytebane', href: '/oysletta-skytterbane/' },
    ],
  },
  { label: 'Kontakt', href: '/kontakt/' },
];

/** Legg til base-stien (f.eks. /namdal_sportsskytterlag på GitHub Pages). */
export function url(path = '/') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Erstatt {{BASE}} i HTML fra WordPress med riktig base-sti. */
export function html(s = '') {
  return s.replaceAll('{{BASE}}', import.meta.env.BASE_URL.replace(/\/$/, ''));
}

export function media(src) {
  return src ? html(src) : null;
}

export function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('nb-NO', opts).format(new Date(iso));
}

export const pages = content.pages;
export const posts = content.posts;
export const generatedAt = content.generatedAt;
export const findPage = (slug) => content.pages.find((p) => p.slug === slug);
