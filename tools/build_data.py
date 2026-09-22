"""Build site/data/exhibition.json from ludwig.txt + hand-curated metadata.

Run:  python3 tools/build_data.py
Everything the app shows or speaks comes out of this file, so edit texts,
positions, threads or pronunciations here and re-run (then re-render audio).
"""
import json, re, os, unicodedata, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, 'ludwig.txt'), encoding='utf-8').read().split('\n')

# ---------------------------------------------------------------- floor plan
# Dot positions were auto-detected on each térkép*.png and normalised to that
# map's building outline, so all five maps share one coordinate space (0..1).
BBOX = {'A': (357, 487, 1665, 1494), 'B': (355, 499, 1660, 1504), 'C': (335, 489, 1682, 1527),
        'D': (342, 487, 1656, 1499), 'E': (354, 488, 1669, 1502)}

def norm(m, x, y):
    x0, y0, x1, y1 = BBOX[m]
    return [round((x - x0) / (x1 - x0), 4), round((y - y0) / (y1 - y0), 4)]

# ---------------------------------------------------------------- sections
SECTIONS = [
    dict(id='A', title='The Sadness of Fulfilled Tales', hu='Beteljesült mesék szomorúsága',
         marker='A. THE SADNESS OF FULFILLED TALES', color='#7fa7c9',
         mood='bittersweet', tagline='When the future already happened.'),
    dict(id='B', title='Personal Worlds', hu='Sajátvilágok', marker='B. PERSONAL WORLDS', color='#8fbf8a',
         mood='warm', tagline='Private universes, built to survive.'),
    dict(id='C', title='The End of Ideology', hu='Ideológiák alkonya', marker='C. THE END OF IDEOLOGY', color='#d98c6a',
         mood='cold', tagline='What is left when the big ideas run out.'),
    dict(id='D', title='No(n) Future!', hu='No(n) Future!', marker='D. NO(N) FUTURE!', color='#b49be0',
         mood='sparse', tagline='Places that are nowhere in particular.'),
    dict(id='E', title='Metropolis', hu='Metropolis', marker='E. METROPOLIS', color='#e6c065',
         mood='pulse', tagline='Dream cities and their hangovers.'),
]

# ---------------------------------------------------------------- artworks
# marker = first chars of the title line in ludwig.txt
# artist = museum spelling (SURNAME Given for Hungarians), name = English order
ARTWORKS = [
    # A
    dict(id='sai-mildew', s='A', marker='Sai, OLEKSIY: Mildew', artist='Oleksiy SAI', name='Oleksiy Sai',
         title='Mildew', year='2018', img='mildew.jpg', pos=norm('A', 573, 747)),
    dict(id='drozdik', s='A', marker='DROZDIK Orshi: Adventure', artist='DROZDIK Orshi', name='Orshi Drozdik',
         title='Adventure in Technos Dystopium', year='1983 – in progress', img='drozdik.JPG', pos=norm('A', 1574, 1301)),
    dict(id='shkurti', s='A', marker='Gentian SHKURTI: Alice', artist='Gentian SHKURTI', name='Gentian Shkurti',
         title='Alice in Wonderland', year='1997', img='alice.jpg', pos=norm('A', 1046, 539)),
    dict(id='keresztes', s='A', marker='KERESZTES Zsófia: Combat', artist='KERESZTES Zsófia', name='Zsófia Keresztes',
         title='Combat Car II.', year='2022', img='kereszteszsófi.jpg', pos=norm('A', 1591, 558)),
    dict(id='kintera', s='A', marker='KIKINTERA: Postnaturalia', artist='Krištof KINTERA', name='Krištof Kintera',
         title='Postnaturalia & Supernaturalia', year='2018–2024', img='postnaturalia.JPG', pos=norm('A', 1389, 1423)),
    dict(id='szacsva', s='A', marker='SZACSVA Y Pál: Reprojection', artist='SZACSVA Y Pál', name='Pál Szacsva y',
         title='Reprojection XXXIV', year='2002', img='szacsva-y-pál.jpg', pos=norm('A', 776, 539)),
    # B
    dict(id='borsos', s='B', marker='BORSOS Lőrinc: For the Child', artist='BORSOS Lőrinc', name='Lőrinc Borsos',
         title='For the Child of the Future', year='2023', img='borsos.jpg', pos=norm('B', 1315, 765)),
    dict(id='geller', s='B', marker='GELLÉR B. István: Find', artist='GELLÉR B. István', name='István B. Gellér',
         title='Find From the Growing City (Maquettes for Foggy Nights)', year='1993', img='growingcity.JPG', pos=norm('B', 454, 551)),
    dict(id='kaszas-agitprop', s='B', marker='KASZÁS Tamás: Sci Fi Agit', artist='KASZÁS Tamás', name='Tamás Kaszás',
         title='Sci-Fi Agit Prop', year='2010–2018', img='kaszástamás.JPG', pos=norm('B', 1367, 551)),
    dict(id='hudec', s='B', marker='Oto HUDEC: Wave', artist='Oto HUDEC', name='Oto Hudec',
         title='Wave in Front of the Garden', year='2019', img='waveinthefront.jpg', pos=norm('B', 1367, 629)),
    dict(id='szalai', s='B', marker='SZALAI Tibor: Arcadia', artist='SZALAI Tibor', name='Tibor Szalai',
         title='Arcadia (…Scenes 2…)', year='1982', img='szalai.jpg', pos=norm('B', 644, 551)),
    dict(id='tu', s='B', marker='TECHNOLOGIE UND DAS UNHEIMLICHE (T + U) Berlin', artist='TECHNOLOGIE UND DAS UNHEIMLICHE (T+U)',
         name='Technologie und das Unheimliche', title='Hungarofuturist Manifesto', year='2017/2026', img='t+u.png', pos=norm('B', 1233, 550)),
    # C
    dict(id='bluenoses', s='C', marker='BLUE NOSES (Alexander SHABUROV', artist='BLUE NOSES', name='Blue Noses',
         title='Lenin Turning in his Grave', year='1999', img='bluenoses.png', pos=norm('C', 832, 711)),
    dict(id='muresan-cnh', s='C', marker='Ciprian MUREŞAN: Communism', artist='Ciprian MUREŞAN', name='Ciprian Mureşan',
         title='Communism Never Happened', year='2006', img='communistm.jpg', pos=norm('C', 906, 1183)),
    dict(id='nikiforov', s='C', marker='Yevgen NIKIFOROV: On Republic', artist='Yevgen NIKIFOROV', name='Yevgen Nikiforov',
         title="On Republic's Monuments", year='2016', img='republicmonuments.JPG', pos=norm('C', 883, 853)),
    dict(id='kisspal', s='C', marker='KISSPÁL Szabolcs: Utopia', artist='KISSPÁL Szabolcs', name='Szabolcs KissPál',
         title='Utopia Battery (1, 2, 3)', year='2008', img='kispál-utopia.jpg', pos=norm('C', 1047, 1011)),
    dict(id='szombathy', s='C', marker='SZOMBATHY Bálint: Lenin', artist='SZOMBATHY Bálint', name='Bálint Szombathy',
         title='Lenin in Budapest', year='1972/2010', img='szombathy.jpg', pos=norm('C', 653, 711)),
    dict(id='varnai', s='C', marker='VÁRNAI Gyula: Rainbow', artist='VÁRNAI Gyula', name='Gyula Várnai',
         title='Rainbow (Peace on Earth)', year='2017', img='várnai.JPG', pos=norm('C', 764, 1011)),
    # D
    dict(id='csakany', s='D', marker='CSÁKÁNY István:| Erecting, 2008', artist='CSÁKÁNY István', name='István Csákány',
         title='Erecting', year='2008', img='erecting.jpg', pos=norm('D', 653, 796)),
    dict(id='dani', s='D', marker='Endri DANI: 182 cm, 2016', artist='Endri DANI', name='Endri Dani',
         title='182 cm', year='2016', img='endridani.jpg', pos=norm('D', 1155, 1396)),
    dict(id='kotatkova', s='D', marker='Eva KOŤÁTKOVÁ: Sit Up Straight, 2008', artist='Eva KOŤÁTKOVÁ', name='Eva Koťátková',
         title='Sit Up Straight', year='2008', img='situpstraight.jpg', pos=norm('D', 1553, 1054)),
    dict(id='gerber', s='D', marker='GERBER Pál: Art is Going', artist='GERBER Pál', name='Pál Gerber',
         title='Art is Going to Stop It', year='2005', img='gerber.JPG', pos=norm('D', 1220, 618)),
    dict(id='kaszas-kiosk', s='D', marker='KASZÁS Tamás: Kiosk Hut', artist='KASZÁS Tamás', name='Tamás Kaszás',
         title='Kiosk Hut', year='2026', img='kaszás.jpg', pos=norm('D', 980, 722)),
    dict(id='weibel', s='D', marker='Peter WEIBEL: Europa(t)raum', artist='Peter WEIBEL', name='Peter Weibel',
         title='Europa(t)raum', year='1983/2026', img='europatraum.JPG', pos=norm('D', 614, 924)),
    dict(id='sr-greater-europe', s='D', marker='SOCIÉTÉ RÉALISTE: Greater Europe', artist='SOCIÉTÉ RÉALISTE', name='Société Réaliste',
         title='Greater Europe', year='2008–2009', img='societerealiste-greatereurope.jpg', pos=norm('D', 405, 910)),
    dict(id='sr-fountainhead', s='D', marker='SOCIÉTÉ RÉALISTE: The Fountainhead', artist='SOCIÉTÉ RÉALISTE', name='Société Réaliste',
         title='The Fountainhead', year='2010', img='société-réaliste-fountainhead.jpg', pos=norm('D', 440, 940)),
    # E
    dict(id='fogarasi', s='E', marker='Andreas FOGARASI: Haus', artist='Andreas FOGARASI', name='Andreas Fogarasi',
         title='Haus der Begegnung (House of Encounters)', year='2019', img='fogarasi.JPG', pos=norm('E', 1130, 1075)),
    dict(id='muresan-bucharest', s='E', marker='Ciprian MUREŞAN: Bucharest', artist='Ciprian MUREŞAN', name='Ciprian Mureşan',
         title='Bucharest City Model (detail)', year='2014/2026', img='bucharest.JPG', pos=norm('E', 1065, 1260)),
    dict(id='esterhazy', s='E', marker='ESTERHÁZY Marcell: h.l.m.v', artist='ESTERHÁZY Marcell', name='Marcell Esterházy',
         title='h.l.m.v 2.0', year='2004', img='esterházymarcell-hlmv.jpg', pos=norm('E', 1279, 1123)),
    dict(id='kaszas-ornament', s='E', marker='KASZÁS Tamás: Ornament and Crime', artist='KASZÁS Tamás', name='Tamás Kaszás',
         title='Ornament and Crime', year='2015', img='kaszásornament.JPG', pos=norm('E', 1268, 910)),
    dict(id='lakner', s='E', marker='LAKNER Antal: Bundesberg', artist='LAKNER Antal', name='Antal Lakner',
         title='Bundesberg Berlin (The Tallest Man-Made Mountain in the World)', year='2002–2006', img='laknerantal.jpg', pos=norm('E', 1599, 756)),
    dict(id='boyadjiev', s='E', marker='Luchezar BOYADJIEV: Utopian', artist='Luchezar BOYADJIEV', name='Luchezar Boyadjiev',
         title='Utopian Solutions for Dystopian Cities', year='2007–2026', img='Luchezar BOYADJIEV- Utopian Solutions for Dystopian Cities.jpg', pos=norm('E', 1295, 1279)),
    dict(id='puklus', s='E', marker='PUKLUS Péter: 5130', artist='PUKLUS Péter', name='Péter Puklus',
         title='5130 (Tatlin)', year='2010', img='5130tatlin.JPG', pos=norm('E', 1419, 1038)),
    dict(id='waliczky', s='E', marker='WALICZKY Tamás: Vision', artist='WALICZKY Tamás', name='Tamás Waliczky',
         title='Vision on Mong Kok East Footbridge', year='2023', img='visiononmongkokeast.jpg', pos=norm('E', 1130, 797)),
]

# Places on the plan that are not (textual) artworks
PLACES = [
    dict(id='entrance', label='Entrance · You are here', pos=norm('A', 919, 1352)),
    dict(id='library', label='Library', pos=norm('A', 1148, 539)),
    dict(id='paik', label='Nam June Paik', pos=norm('A', 1033, 1431)),
    # Path A's printed map also marks a Société Réaliste stop in the upper corridor.
    dict(id='sr-a', label='Société Réaliste (marked on path A)', pos=norm('A', 856, 614),
         works=['sr-fountainhead', 'sr-greater-europe']),
]

# ---------------------------------------------------------------- threads
# Cross-path connections ("goes well with"). Framing lines are ours, not the museum's.
THREADS = [
    dict(id='lenin', title='Lenin, again and again',
         line='The same face keeps coming back: carried, buried, toppled.',
         works=['bluenoses', 'szombathy', 'nikiforov']),
    dict(id='romania', title="Ceaușescu's Romania",
         line='Three takes on one regime: its songs, its bulldozers, a family packing to leave.',
         works=['muresan-cnh', 'muresan-bucharest', 'puklus']),
    dict(id='built', title='Built utopias, lived-in dystopias',
         line='Buildings that were meant to fix society, and what happened to the people inside.',
         works=['kaszas-kiosk', 'kaszas-ornament', 'puklus', 'fogarasi', 'esterhazy', 'muresan-bucharest', 'dani', 'csakany']),
    dict(id='maps', title='Maps that lie',
         line='Borders, dream-geographies and cities redrawn: who gets to draw the map?',
         works=['sr-greater-europe', 'weibel', 'boyadjiev', 'lakner', 'tu']),
    dict(id='survival', title='After the collapse',
         line='Survival kits, sealed gardens, rituals for whoever comes next.',
         works=['kaszas-agitprop', 'hudec', 'borsos', 'lakner', 'kintera']),
    dict(id='fiction', title='Fake archives, invented worlds',
         line='Artists building whole civilisations, scientists and myths that never existed.',
         works=['drozdik', 'geller', 'tu', 'szalai', 'lakner']),
    dict(id='crowds', title='Grey crowds, little people',
         line='The anonymous majority: office workers, marchers, commuters, figurines.',
         works=['sai-mildew', 'bluenoses', 'csakany', 'waliczky', 'szombathy']),
    dict(id='screens', title='Screens that twist the story',
         line='TV, film and projection: what happens when the image is the event.',
         works=['shkurti', 'weibel', 'szacsva', 'sr-fountainhead', 'waliczky', 'esterhazy']),
    dict(id='bodies', title='Bodies under control',
         line='Posture, identity and fragile bodies: the personal side of a system.',
         works=['kotatkova', 'keresztes', 'drozdik', 'szalai']),
    dict(id='propaganda', title="Propaganda's colour palette",
         line='Badges, posters, slogans: the design of believing.',
         works=['varnai', 'kaszas-agitprop', 'muresan-cnh', 'szombathy', 'kisspal']),
    dict(id='nature', title='Technology eats nature',
         line='E-waste blossoms, missing insects, a mountain made of rubble.',
         works=['kintera', 'hudec', 'drozdik', 'lakner']),
]

# ---------------------------------------------------------------- text cleaning
FIXES = [
    ('[1]', ''), ('isconnectedattached', 'is connected'), ('natureal', 'natural'),
    ('garden has becomes', 'garden has become'), ('Dorzdik', 'Drozdik'), ('ummy', 'mummy'),
    ('internationally ճանաչed', 'internationally recognised'), ('VeniceBiennale', 'Venice Biennale'),
    ('postStalinist', 'post-Stalinist'), ('couldhave-been', 'could-have-been'), ('onefifth', 'one-fifth'),
    ('largescale', 'large-scale'), ('So-viet', 'Soviet'), ('destorying', 'destroying'),
    ('Engeneering', 'Engineering'), ('irony,melancholy', 'irony, melancholy'), ('ambivalancies', 'ambivalences'),
    ('metropolitain', 'metropolitan'), ('postAnthropocene', 'post-Anthropocene'), ('appartment', 'apartment'),
    ('Most major cities are characterized by rows of sales booths with their brutally simple merchandise: newspapers, tobacco, coffee, soft drinks, street food, etc ', ''),
    ('drawing attention to the lack of civilized mechanisms to work with the past i', 'drawing attention to the lack of civilized mechanisms to work with the past.'),
    ('work with the past i\n', 'work with the past.\n'),
    ('social,', 'social, '), ('historical,social', 'historical, social'), ('conflicts.This', 'conflicts. This'),
    ('reconstruction.Fogarasi', 'reconstruction. Fogarasi'), ('the tip of a spear', 'the tip of a spear'),
    (' however, this often', ' However, this often'), ('Time’s', 'Time’s'), ('  ', ' '),
    ('Kintera’s method', 'Kintera’s method'), ('Ceaușima', 'Ceaușima'),
    ('The Life of Edith Simpson Epitome', 'The Life of Edith Simpson, Epitome'),
    ('Lenin’s mummy', 'Lenin’s mummy'), ('l.m.v.h. 2.0', 'h.l.m.v 2.0'),
    ('Reprojection XIII and XXXIV', 'Reprojection XIII and XXXIV'), ('braking', 'breaking'),
]
NOISE = re.compile(r'^(Black Mirror\. The Long Shadow of the Future|April 8, 2026.*|\s*•\s*|1d53e81|Cookies|We use cookies.*|Accept.*|Artworks in room)$')
CREDIT = re.compile(r'\s*\((?:[A-Z][A-Za-z]{0,2}(?:\s*[–/-]\s*[A-Z][A-Za-z]{0,2})*(?:\s*/\s*source:[^)]*)?|Excerpt from[^)]*|Petrányi Zsolt\s*—\s*KJ|Joanna Sokolowska)\)?\s*$')
CREDIT_INLINE = re.compile(r'\s*\((?:[A-Z]{1,3}(?:\s*[–/-]\s*[A-Z]{1,3})*)\)')

def find(marker, start=0, last=False):
    rng = range(len(SRC) - 1, start - 1, -1) if last else range(start, len(SRC))
    for i in rng:
        line = SRC[i].strip()
        if line.startswith(marker) and not line.endswith('...'):
            return i
    raise KeyError(marker)

def block(start, stop_markers):
    """Lines after `start` until the next page-footer 'Black Mirror.' line."""
    out = []
    for line in SRC[start:]:
        if line.startswith('Black Mirror. The Long Shadow'):
            break
        out.append(line)
    return out

def paragraphs(lines):
    lines = [l.rstrip().replace(' ', ' ') for l in lines]
    lines = [l for l in lines if not NOISE.match(l.strip())]
    paras, cur = [], ''
    for l in lines:
        s = l.strip()
        if not s:
            if cur:
                paras.append(cur); cur = ''
            continue
        if not cur:
            cur = s
        elif re.search(r'[.!?:”"…)]$', cur) and (s[0].isupper() or s[0] in '“"'):
            # line ended a sentence and next starts a new one: treat as a new paragraph
            paras.append(cur); cur = s
        else:
            cur += ' ' + s
    if cur:
        paras.append(cur)
    text = '\n'.join(paras)
    for a, b in FIXES:
        text = text.replace(a, b)
    text = re.sub(r' {2,}', ' ', text)
    return [p.strip() for p in text.split('\n') if p.strip()]

def split_credit(paras):
    credit = None
    last = paras[-1]
    m = CREDIT.search(last)
    if m:
        credit = m.group(0).strip().strip('()')
        paras[-1] = last[:m.start()].rstrip()
        if not paras[-1]:
            paras.pop()
    paras = [CREDIT_INLINE.sub('', p) for p in paras]
    return paras, credit

ABBR = r'(?:e\.g|i\.e|etc|cca|Dr|St|No|vs|Ed|pcs|approx|B)\.'
def sentences(p):
    # protect abbreviations / initials
    t = re.sub(r'\b(' + ABBR[3:-3] + r')\.', lambda m: m.group(1) + '․', p)
    t = re.sub(r'\b([A-Z])\. (?=[A-Z])', lambda m: m.group(1) + '․ ', t)
    parts = re.split(r'(?<=[.!?…])(?:[”"’)]*)\s+(?=[“"(‘A-ZÁÉÍÓÖŐÚÜŰ0-9])', t)
    # re-attach closing quotes that the lookbehind left behind
    out = []
    for s in parts:
        s = s.replace('․', '.').strip()
        if out and len(s) < 3:
            out[-1] += ' ' + s
        elif s:
            out.append(s)
    return out

# ---------------------------------------------------------------- speech
# Respellings so the English voice lands close to Hungarian/Czech/Romanian names.
SAY = [
    ('SZACSVA Y Pál', 'Pál Szacsva y'), ('Szacsva y', 'Sachva ee'), ('Szacsva', 'Sachva'),
    ('Zsófia', 'Zhofia'), ('Keresztes', 'Keresstesh'), ('Lőrinc', 'Lurrintz'), ('Borsos', 'Borshosh'),
    ('István', 'Ishtvaan'), ('Gellér', 'Gellayr'), ('Tamás', 'Tomaash'), ('Kaszás', 'Kossaash'),
    ('Szalai', 'Solloy'), ('KissPál', 'Kish-paal'), ('Kisspál', 'Kish-paal'), ('Szabolcs', 'Sobolch'),
    ('Bálint', 'Baalint'), ('Szombathy', 'Sombotti'), ('Gyula', 'Dyoola'), ('Várnai', 'Vaarnoy'),
    ('Csákány', 'Chaakaany'), ('Pál', 'Paal'), ('Esterházy', 'Esterhaazy'), ('Lakner', 'Lokner'),
    ('Péter', 'Payter'), ('Puklus', 'Pooklush'), ('Waliczky', 'Volitskee'), ('Mureşan', 'Mooreshan'),
    ('Mureșan', 'Mooreshan'), ('Ciprian', 'Chipree-an'), ('Krištof', 'Krishtof'), ('Koťátková', 'Kotyaatkova'),
    ('Kintera', 'Kintera'), ('Société Réaliste', 'Sossyetay Ray-aleest'), ('Drozdik', 'Drozdik'),
    ('Ceaușescu', 'Chow-shesku'), ('Ceauşescu', 'Chow-shesku'), ('Ceaușima', 'Chow-sheema'),
    ('Kassák', 'Koshaak'), ('Óbuda', 'Oh-buda'), ('Dunaújváros', 'Duna-ooy-vaarosh'), ('Kádár', 'Kaadaar'),
    ('Dózsa György', 'Dozha Dyurdy'), ('Moholy-Nagy', 'Moholy-Nodge'), ('Rózsa', 'Rozha'),
    ('Miklósvölgyi', 'Meekloash-vurdyi'), ('Márió', 'Maario'), ('Márk Fridvalszki', 'Maark Fridvolski'),
    ('Szentendre', 'Sent-endreh'), ('Művészet Malom', 'Moo-vay-set Molom'), ('Ferenczy', 'Ferentsy'),
    ('Košice', 'Koshitseh'), ('Žilina', 'Zhilina'), ('Shkodër', 'Shkodra'), ('Verkhovna Rada', 'Verkhovna Rahda'),
    ('Leninopad', 'Lenin-o-pad'), ('Kolozsvár', 'Kolozhvaar'), ('Brettschneider', 'Bret-shnyder'),
    ('Hašek', 'Hashek'), ('Švejk', 'Shvayk'), ('Ybl Miklós', 'Ibl Meekloash'), ('Obuda', 'Oh-buda'),
    ('Dóra Maurer', 'Dora Maurer'), ('Europa(t)raum', 'Europa-traum'), ('Kozmosz Fantasztikus Könyvek', 'Kozmos Fontostikush Kunyvek'),
    ('Nyikiforov', 'Nikiforov'), ('Oleksiy', 'Oleksiy'), ('Sai', 'Sigh'), ('Csáky', 'Chaaky'),
    ('Labourdette', 'Laboor-det'), ('Hervé', 'Air-vay'), ('Unité d’habitation', 'Unitay dabitasion'),
    ('T+U', 'T plus U'), ('(T + U)', ''), ('HUF', 'H U F'), ('ZKM', 'Z K M'), ('Hungarofuturism', 'Hungaro-futurism'),
    ('Hungarofuturist', 'Hungaro-futurist'), ('Hungarosaurs', 'Hungaro-saurs'), ('Turul', 'Toorool'),
    ('Techné', 'Tekhnay'), ('techné', 'tekhnay'), ('non-lieux', 'non-lee-uh'), ('Marc Augé', 'Mark Oh-zhay'),
    ('Volkshochschule', 'Folks-hohh-shoola'), ('Haus der Begegnung', 'House dair Be-gay-gnung'),
    ('Per-Albin-Hansen-Siedlung', 'Pair Albin Hansen Zeedlung'), ('Bundesberg', 'Boondes-berg'),
    ('h.l.m.v 2.0', 'H L M V two point oh'), ('Offret', 'Offret'), ('Tempelhof', 'Tempel-hof'),
    ('Poporul, Ceaușescu, România (Cîntece Patriotice)', 'a record of patriotic songs'),
    ('cca 16 qm', 'about sixteen square metres'), ('Mong Kok', 'Mong Kok'),
    ('Sci Fi Agit Prop', 'Sci-fi Agit-prop'), ('agitprop', 'agit-prop'), ('Agit Prop', 'Agit-prop'),
    ('(KB)', ''), ('XXXIV', 'thirty-four'), ('XIII', 'thirteen'), ('II.', 'two.'),
    ('20th', 'twentieth'), ('21st', 'twenty-first'), ('18th', 'eighteenth'), ('19th', 'nineteenth'),
    ('’70s', 'seventies'), ('‘70s', 'seventies'), ('1980s', 'nineteen-eighties'),
    ('—', ', '), ('–', ' to '), ('[...]', ''), ('[…]', ''), ('…', '...'), (' / ', ', '), ('/', ', '),
]
SAY_RE = [(re.compile((r'\b' if a[0].isalnum() else '') + re.escape(a) + (r'\b' if a[-1].isalnum() else '')), b) for a, b in SAY]
def spoken(s):
    s = re.sub(r'(\d)/(\d)', r'\1, \2', s)
    for rx, b in SAY_RE:
        s = rx.sub(lambda m: b, s)
    s = re.sub(r'\.{2}(?!\.)', '.', s)
    s = re.sub(r'(\d{4}) to (\d{2,4})', r'\1 to \2', s)
    s = re.sub(r'\s+,', ',', s)
    s = re.sub(r' {2,}', ' ', s).strip()
    return s

def make_segment(seg_id, title_d, title_s, paras):
    out = [{'p': -1, 'd': title_d, 's': title_s}]
    for pi, p in enumerate(paras):
        for s in sentences(p):
            # \x02 etc. are soft-hyphen leftovers from the PDF: hidden in display. The spoken text keeps
            # them only so existing recordings stay valid (the voice ignores them).
            out.append({'p': pi, 'd': re.sub(r'[\x00-\x08\x0b-\x1f]', '', s), 's': spoken(s)})
    return {'id': seg_id, 'sentences': out}

# ---------------------------------------------------------------- build
segments = {}

# Exhibition intro (the "wall of text" at the entrance)
intro_lines = SRC[find('“The future is too dark'):find('Curators:')]
intro_paras = paragraphs(intro_lines)
segments['intro'] = make_segment('intro', 'Black Mirror. The Long Shadow of the Future',
    'Welcome to Black Mirror: The Long Shadow of the Future. A thematic selection from the Ludwig Museum’s collection.', intro_paras)

for sec in SECTIONS:
    i = find(sec['marker'])
    j = find('Artworks in room', i)
    paras = paragraphs(SRC[i + 1:j])
    sec['text_segment'] = 'section-' + sec['id']
    segments['section-' + sec['id']] = make_segment('section-' + sec['id'],
        f"{sec['id']}. {sec['title']}", f"Section {sec['id']}. {spoken(sec['title'])}.", paras)

for a in ARTWORKS:
    i = find(a['marker'], last=True)
    medium = SRC[i + 1].strip()
    lines = block(i + 1, [])
    # first line after title is the medium (except Borsos/T+U/Blue Noses)
    body = lines[1:] if medium and not medium.endswith('.') and len(medium) < 160 else lines
    if a['id'] in ('borsos',):
        body, medium = lines, ''
    if a['id'] == 'tu':
        medium = 'Berlin–Budapest art collective, DE / HU'
        body = lines[2:]
    if a['id'] == 'bluenoses':
        medium = 'from the series “Little People”'
        body = lines[1:]
    paras = paragraphs(body)
    paras, credit = split_credit(paras)
    a['medium'] = medium.replace('selection from the subsections of the series', 'selection from the series')
    a['credit'] = credit
    say_title = spoken(a['title']).rstrip('.') + f". By {spoken(a['name'])}, {spoken(a['year'])}."
    segments[a['id']] = make_segment(a['id'], a['title'], say_title, paras)
    a['threads'] = [t['id'] for t in THREADS if a['id'] in t['works']]

# Nam June Paik: no wall text in our material; keep it short and general.
segments['paik'] = make_segment('paik', 'Nam June Paik', 'Nam June Paik, at the entrance.', [
    'Right by the entrance stands a work by Nam June Paik (1932–2006), the Korean-born artist often called the father of video art.',
    'Paik was among the first to treat the television set itself as a sculptural material and to imagine a networked, screen-filled future long before the internet. Our handout has no wall text for this piece, so look at it first: what does a screen from the past say about the future we are living in now?'])

# ---------------------------------------------------------------- paths
entrance = next(p for p in PLACES if p['id'] == 'entrance')['pos']
def dist(a, b):
    # plan is 1.3 : 1, measure in real proportions
    return math.hypot((a[0] - b[0]) * 1.3, a[1] - b[1])

paths = []
for sec in SECTIONS:
    works = [a for a in ARTWORKS if a['s'] == sec['id']]
    order, cur = [], entrance
    left = works[:]
    while left:
        nxt = min(left, key=lambda w: dist(cur, w['pos']))
        order.append(nxt['id']); left.remove(nxt); cur = nxt['pos']
    paths.append({'id': sec['id'], 'stops': order})

by_id = {a['id']: a for a in ARTWORKS}
def near_phrase(a, b):
    d = dist(a, b)
    if d < 0.09: return 'It’s right next to this one.'
    if d < 0.2: return 'It’s just a few steps away.'
    if d < 0.4: return 'It’s a little further on. Check the map if you need to.'
    return 'It’s on the other side of the exhibition, so follow the glowing pin on the map.'

for path in paths:
    sec = next(s for s in SECTIONS if s['id'] == path['id'])
    stops = path['stops']
    for k, wid in enumerate(stops):
        w = by_id[wid]
        prev = entrance if k == 0 else by_id[stops[k - 1]]['pos']
        if k == 0:
            d = f"First stop: {w['title']} by {w['name']}."
        elif k == len(stops) - 1:
            d = f"Last stop on this path: {w['title']} by {w['name']}."
        else:
            d = f"Stop {k + 1} of {len(stops)}: {w['title']} by {w['name']}."
        d2 = near_phrase(prev, w['pos'])
        sid = f"bridge-{path['id']}-{k}"
        segments[sid] = {'id': sid, 'sentences': [
            {'p': 0, 'd': d, 's': spoken(d)}, {'p': 0, 'd': d2, 's': d2}]}
    sid = f"outro-{path['id']}"
    d = f"That was path {path['id']}, {sec['title']}. Pick another path, or just wander and tap whatever catches your eye."
    segments[sid] = {'id': sid, 'sentences': [{'p': 0, 'd': d, 's': spoken(d)}]}

# ---------------------------------------------------------------- write
for a in ARTWORKS:
    a['image'] = 'img/art/' + a['id'] + '.webp'
    a['thumb'] = 'img/art/' + a['id'] + '.thumb.webp'
    a['src_img'] = unicodedata.normalize('NFC', a['img'])
    a.pop('marker'); a.pop('img')
for s in SECTIONS:
    s.pop('marker')

walls = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'walls.json')))
data = dict(sections=SECTIONS, artworks=ARTWORKS, places=PLACES, threads=THREADS, paths=paths,
            plan=walls, segments=segments)
os.makedirs(os.path.join(ROOT, 'site', 'data'), exist_ok=True)
with open(os.path.join(ROOT, 'site', 'data', 'exhibition.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
n = sum(len(s['sentences']) for s in segments.values())
chars = sum(len(x['s']) for s in segments.values() for x in s['sentences'])
print(f"{len(ARTWORKS)} artworks, {len(segments)} segments, {n} sentences, {chars} spoken chars (~{chars/900:.0f} min)")
for p in paths: print(p['id'], ' → '.join(p['stops']))
