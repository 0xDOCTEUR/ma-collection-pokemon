import { FRENCH_NAMES } from './frenchNames'

/** Nom anglais normalisé du Pokémon, rangé par génération. */
export const GENERATION_OPTIONS = [
  { id: 1, label: 'Génération 1 — Kanto' },
  { id: 2, label: 'Génération 2 — Johto' },
  { id: 3, label: 'Génération 3 — Hoenn' },
  { id: 4, label: 'Génération 4 — Sinnoh' },
  { id: 5, label: 'Génération 5 — Unys' },
  { id: 6, label: 'Génération 6 — Kalos' },
  { id: 7, label: 'Génération 7 — Alola' },
  { id: 8, label: 'Génération 8 — Galar' },
  { id: 9, label: 'Génération 9 — Paldea' },
] as const

const NAMES_BY_GEN: Record<number, readonly string[]> = {
  1: ["aerodactyl","bellsprout","butterfree","charmander","charmeleon","electabuzz","farfetch d","hitmonchan","jigglypuff","kangaskhan","tentacruel","victreebel","weepinbell","wigglytuff","blastoise","bulbasaur","charizard","dragonair","dragonite","electrode","exeggcute","exeggutor","farfetchd","growlithe","hitmonlee","lickitung","magnemite","nidoqueen","nidoran f","nidoran m","ninetales","pidgeotto","poliwhirl","poliwrath","sandshrew","sandslash","tentacool","vileplume","wartortle","alakazam","arcanine","articuno","beedrill","caterpie","clefable","clefairy","cloyster","graveler","gyarados","kabutops","magikarp","magneton","nidoking","nidorina","nidorino","parasect","primeape","rapidash","raticate","shellder","slowpoke","squirtle","vaporeon","venomoth","venusaur","chansey","dewgong","diglett","dratini","drowzee","dugtrio","flareon","geodude","goldeen","golduck","haunter","ivysaur","jolteon","kadabra","kingler","koffing","machamp","machoke","marowak","metapod","moltres","mr mime","nidoran","omanyte","omastar","persian","pidgeot","pikachu","poliwag","porygon","psyduck","rattata","rhyhorn","scyther","seaking","slowbro","snorlax","spearow","starmie","tangela","venonat","voltorb","weezing","cubone","dodrio","fearow","gastly","gengar","golbat","grimer","horsea","kabuto","kakuna","krabby","lapras","machop","magmar","mankey","meowth","mewtwo","oddish","pidgey","pinsir","ponyta","raichu","rhydon","seadra","staryu","tauros","vulpix","weedle","zapdos","arbok","ditto","doduo","eevee","ekans","gloom","golem","hypno","paras","zubat","abra","jynx","onix","seel","mew","muk"],
  2: ["feraligatr","forretress","misdreavus","typhlosion","azumarill","bellossom","chikorita","cyndaquil","dunsparce","girafarig","heracross","hitmontop","igglybuff","octillery","piloswine","sudowoodo","teddiursa","tyranitar","wobbuffet","ampharos","chinchou","croconaw","delibird","granbull","hoothoot","houndoom","houndour","jumpluff","larvitar","magcargo","meganium","politoed","porygon2","quagsire","qwilfish","remoraid","skarmory","skiploom","slowking","smeargle","smoochum","snubbull","spinarak","stantler","sunflora","totodile","ursaring","ariados","bayleef","blissey","corsola","donphan","flaaffy","kingdra","lanturn","mantine","miltank","murkrow","noctowl","pupitar","quilava","sentret","shuckle","sneasel","steelix","suicune","sunkern","togetic","tyrogue","umbreon","celebi","cleffa","crobat","elekid","espeon","furret","gligar","hoppip","ledian","ledyba","mareep","marill","phanpy","pineco","raikou","scizor","slugma","swinub","togepi","wooper","aipom","entei","ho oh","lugia","magby","pichu","unown","yanma","natu","xatu"],
  3: ["masquerain","beautifly","combusken","crawdaunt","electrike","gardevoir","manectric","marshtomp","metagross","mightyena","poochyena","registeel","relicanth","salamence","shroomish","zigzagoon","barboach","blaziken","cacturne","camerupt","carvanha","castform","chimecho","clamperl","corphish","delcatty","dusclops","gorebyss","hariyama","illumise","ludicolo","lunatone","makuhita","medicham","meditite","nosepass","pelipper","rayquaza","regirock","sceptile","sharpedo","shedinja","swampert","trapinch","vigoroth","whiscash","zangoose","altaria","anorith","armaldo","azurill","banette","breloom","cascoon","claydol","cradily","duskull","exploud","groudon","grovyle","grumpig","huntail","jirachi","kecleon","linoone","loudred","luvdisc","milotic","nincada","ninjask","nuzleaf","roselia","sableye","seviper","shelgon","shiftry","shuppet","silcoon","slaking","slakoth","snorunt","solrock","surskit","swellow","taillow","torchic","torkoal","treecko","tropius","vibrava","volbeat","wailmer","wailord","walrein","whismur","wingull","wurmple","aggron","baltoy","beldum","cacnea","deoxys","dustox","feebas","flygon","glalie","gulpin","kirlia","kyogre","lairon","latias","latios","lileep","lombre","mawile","metang","mudkip","plusle","regice","sealeo","seedot","skitty","spheal","spinda","spoink","swablu","swalot","wynaut","absol","bagon","lotad","minun","numel","ralts","aron"],
  4: ["electivire","hippopotas","kricketune","lickilicky","abomasnow","bastiodon","carnivine","chingling","cresselia","gastrodon","hippowdon","honchkrow","infernape","kricketot","magmortar","magnezone","mamoswine","mismagius","pachirisu","porygon z","probopass","rampardos","regigigas","rhyperior","spiritomb","staraptor","tangrowth","toxicroak","vespiquen","bronzong","chimchar","cranidos","croagunk","drifblim","drifloon","dusknoir","empoleon","floatzel","froslass","garchomp","giratina","lumineon","monferno","munchlax","prinplup","roserade","shieldon","skuntank","staravia","togekiss","torterra","wormadam","ambipom","bibarel","bronzor","buneary","cherrim","cherubi","darkrai","drapion","finneon","gallade","glaceon","glameow","gliscor","happiny","heatran","leafeon","lopunny","lucario","manaphy","mantyke","mesprit","mime jr","purugly","shaymin","shellos","skorupi","turtwig","weavile","yanmega","arceus","bidoof","bonsly","buizel","chatot","combee","dialga","gabite","grotle","luxray","mothim","palkia","phione","piplup","snover","starly","stunky","azelf","budew","burmy","gible","luxio","riolu","rotom","shinx","uxie"],
  5: ["bouffalant","carracosta","chandelure","cofagrigus","conkeldurr","darmanitan","eelektross","escavalier","ferrothorn","galvantula","gothitelle","karrablast","krookodile","roggenrola","seismitoad","whimsicott","whirlipede","alomomola","amoonguss","cryogonal","druddigon","eelektrik","excadrill","ferroseed","gothorita","hydreigon","jellicent","klinklang","lilligant","mandibuzz","palpitoad","reuniclus","scolipede","serperior","stoutland","terrakion","thundurus","tranquill","vanillish","vanillite","vanilluxe","volcarona","zebstrika","accelgor","archeops","basculin","beheeyem","braviary","cinccino","cobalion","cottonee","darumaka","deerling","ducklett","frillish","garbodor","genesect","gigalith","krokorok","landorus","larvesta","leavanny","lillipup","maractus","meloetta","mienshao","minccino","musharna","oshawott","pawniard","purrloin","reshiram","samurott","sawsbuck","sewaddle","sigilyph","simipour","simisage","simisear","stunfisk","swadloon","tirtouga","tornadus","trubbish","unfezant","venipede","virizion","zweilous","beartic","bisharp","blitzle","boldore","crustle","cubchoo","drilbur","duosion","dwebble","foongus","fraxure","gothita","gurdurr","haxorus","heatmor","herdier","lampent","liepard","litwick","mienfoo","panpour","pansage","pansear","petilil","pignite","rufflet","sandile","scrafty","scraggy","servine","shelmet","solosis","swoobat","timburr","tympole","victini","vullaby","watchog","zoroark","archen","audino","dewott","durant","elgyem","emboar","emolga","golett","golurk","joltik","keldeo","kyurem","patrat","pidove","swanna","tynamo","woobat","yamask","zekrom","deino","klang","klink","munna","snivy","tepig","throh","zorua","axew","sawk"],
  6: ["fletchinder","aromatisse","barbaracle","chesnaught","fletchling","helioptile","scatterbug","talonflame","aegislash","clauncher","clawitzer","diggersby","frogadier","gourgeist","heliolisk","pumpkaboo","quilladin","trevenant","tyrantrum","volcanion","bergmite","bunnelby","doublade","dragalge","fennekin","greninja","hawlucha","meowstic","phantump","slurpuff","spritzee","vivillon","aurorus","avalugg","binacle","braixen","carbink","chespin","dedenne","delphox","diancie","flabebe","floette","florges","froakie","furfrou","honedge","malamar","noivern","pancham","pangoro","sliggoo","swirlix","sylveon","xerneas","yveltal","zygarde","amaura","espurr","gogoat","goodra","klefki","litleo","noibat","pyroar","skiddo","skrelp","spewpa","tyrunt","goomy","hoopa","inkay"],
  7: ["crabominable","blacephalon","celesteela","crabrawler","incineroar","togedemaru","turtonator","wishiwashi","araquanid","bounsweet","charjabug","decidueye","golisopod","marshadow","naganadel","palossand","passimian","pheromosa","primarina","pyukumuku","sandygast","shiinotic","stakataka","tapu bulu","tapu fini","tapu koko","tapu lele","toucannon","type null","xurkitree","buzzwole","cutiefly","dewpider","dhelmise","fomantis","gumshoos","guzzlord","hakamo o","jangmo o","lurantis","lycanroc","magearna","mareanie","melmetal","morelull","mudsdale","necrozma","nihilego","oranguru","oricorio","ribombee","rockruff","salandit","salazzle","silvally","solgaleo","torracat","trumbeak","tsareena","vikavolt","brionne","bruxish","cosmoem","dartrix","grubbin","kartana","kommo o","mimikyu","mudbray","pikipek","poipole","popplio","steenee","stufful","toxapex","yungoos","zeraora","bewear","comfey","cosmog","drampa","komala","litten","lunala","meltan","minior","rowlet","wimpod"],
  8: ["barraskewda","basculegion","centiskorch","corviknight","corvisquire","polteageist","stonjourner","copperajah","gossifleur","grimmsnarl","perrserker","pincurchin","sandaconda","sirfetch d","sizzlipede","toxtricity","arctovish","arctozolt","cinderace","clobbopus","coalossal","cramorant","dracovish","dracozolt","dragapult","duraludon","eternatus","glastrier","grapploct","hatterene","obstagoon","regidrago","regieleki","rillaboom","runerigus","scorbunny","silicobra","sirfetchd","spectrier","zamazenta","alcremie","appletun","arrokuda","drakloak","drizzile","eldegoss","enamorus","frosmoth","greedent","impidimp","indeedee","inteleon","orbeetle","overqwil","rolycoly","rookidee","sinistea","sneasler","thwackey","ursaluna","blipbug","boltund","calyrex","chewtle","cursola","dottler","drednaw","dubwool","falinks","flapple","grookey","hatenna","hattrem","kleavor","milcery","morgrem","morpeko","mr rime","skwovet","thievul","urshifu","wyrdeer","applin","carkol","cufant","dreepy","eiscue","nickit","raboot","sobble","wooloo","yamper","zacian","zarude","kubfu","toxel","snom"],
  9: ["brambleghast","brute bonnet","flutter mane","gouging fire","iron boulder","iron jugulis","iron valiant","poltchageist","roaring moon","sandy shocks","slither wing","squawkabilly","walking wake","dudunsparce","fezandipiti","iron bundle","iron leaves","iron thorns","iron treads","kilowattrel","meowscarada","raging bolt","scream tail","annihilape","archaludon","baxcalibur","bombirdier","gimmighoul","great tusk","houndstone","iron crown","iron hands","mabosstiff","oinkologne","scovillain","skeledirge","sprigatito","tarountula","toedscruel","armarouge","bellibolt","ceruledge","charcadet","chien pao","farigiraf","floragato","garganacl","gholdengo","hydrapple","iron moth","kingambit","munkidori","naclstack","pecharunt","quaquaval","revavroom","sinistcha","tandemaus","tatsugiri","terapagos","tinkatink","tinkatuff","toedscool","arboliva","arctibax","bramblin","capsakid","cetoddle","clodsire","crocalor","cyclizar","dachsbun","espathra","frigibax","glimmora","grafaiai","greavard","koraidon","maschiff","maushold","miraidon","orthworm","quaxwell","shroodle","tinkaton","wo chien","cetitan","dipplin","dondozo","fidough","finizen","flamigo","flittle","fuecoco","glimmet","lechonk","ogerpon","okidogi","palafin","spidops","tadbulb","ting lu","wattrel","wiglett","wugtrio","chi yu","dolliv","nymble","pawmot","quaxly","rabsca","rellor","smoliv","varoom","veluza","klawf","lokix","nacli","pawmi","pawmo"],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SPECIES = Object.entries(NAMES_BY_GEN)
  .flatMap(([generation, names]) => names.map((phrase) => ({ phrase, generation: Number(generation) })))
  .sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase))

const GEN_BY_PHRASE = new Map(SPECIES.map((item) => [item.phrase, item.generation]))

const SPECIES_REGEX = new RegExp(
  `(?:^| )(?:${SPECIES.map((item) => escapeRegExp(item.phrase)).join('|')})(?= |$)`,
  'g',
)

export function normalizeCardName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function cardHasGeneration(name: string, generation: number): boolean {
  const text = normalizeCardName(name)
  SPECIES_REGEX.lastIndex = 0
  for (const match of text.matchAll(SPECIES_REGEX)) {
    if (GEN_BY_PHRASE.get(match[0].trim()) === generation) return true
  }
  return false
}

function titlePhrase(value: string): string {
  return value.replace(/(^| )([a-z0-9])/g, (_match, space: string, letter: string) => space + letter.toUpperCase())
}

const FRENCH_LABEL = new Map<string, string>()
for (const [french, english] of Object.entries(FRENCH_NAMES)) {
  const key = normalizeCardName(english)
  const label = titlePhrase(french)
  const current = FRENCH_LABEL.get(key)
  if (!current || label.length < current.length) FRENCH_LABEL.set(key, label)
}

export function speciesLabel(phrase: string): string {
  return FRENCH_LABEL.get(phrase) ?? titlePhrase(phrase)
}

const SPECIES_TEST = new Map<string, RegExp>()

export function cardHasSpecies(name: string, phrase: string): boolean {
  let regex = SPECIES_TEST.get(phrase)
  if (!regex) {
    regex = new RegExp(`(?:^| )${escapeRegExp(phrase)}(?= |$)`)
    SPECIES_TEST.set(phrase, regex)
  }
  return regex.test(normalizeCardName(name))
}

export function mainSpecies(name: string): string | null {
  const text = normalizeCardName(name)
  SPECIES_REGEX.lastIndex = 0
  let best: string | null = null
  for (const match of text.matchAll(SPECIES_REGEX)) {
    const phrase = match[0].trim()
    if (!best || phrase.length > best.length) best = phrase
  }
  return best ? canonicalSpecies(best) : null
}

export interface PokemonOption {
  phrase: string
  label: string
}

let allPokemon: PokemonOption[] | null = null

function allPokemonOptions(): PokemonOption[] {
  if (allPokemon) return allPokemon
  const best = new Map<string, PokemonOption>()
  for (const names of Object.values(NAMES_BY_GEN)) {
    for (const phrase of names) {
      const key = phrase.replace(/ /g, '')
      const label = speciesLabel(phrase)
      const current = best.get(key)
      if (!current) {
        best.set(key, { phrase, label })
        continue
      }
      const currentFrench = current.label.toLowerCase() !== titlePhrase(current.phrase).toLowerCase()
      const nextFrench = label.toLowerCase() !== titlePhrase(phrase).toLowerCase()
      if ((nextFrench && !currentFrench) || (phrase.includes(' ') && !current.phrase.includes(' '))) {
        best.set(key, { phrase, label: nextFrench ? label : current.label })
      }
    }
  }
  allPokemon = [...best.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  return allPokemon
}

const CANONICAL = new Map<string, string>()

function canonicalSpecies(phrase: string): string {
  if (CANONICAL.size === 0) {
    for (const option of allPokemonOptions()) CANONICAL.set(option.phrase.replace(/ /g, ''), option.phrase)
  }
  return CANONICAL.get(phrase.replace(/ /g, '')) ?? phrase
}

export function pokemonOptions(generation: number | null): PokemonOption[] {
  const all = allPokemonOptions()
  if (generation == null) return all
  const allowed = new Set((NAMES_BY_GEN[generation] ?? []).map((name) => name.replace(/ /g, '')))
  return all.filter((option) => allowed.has(option.phrase.replace(/ /g, '')))
}
