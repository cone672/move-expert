// Company location (Zemun, Beograd) – for return trip calculations
const COMPANY_LAT = 44.8459;
const COMPANY_LON = 20.3936;

// Belgrade bounding box
const BGD = { latMin: 44.65, latMax: 44.97, lonMin: 20.18, lonMax: 20.62 };

function inBelgrade(lat, lon) {
    return lat >= BGD.latMin && lat <= BGD.latMax && lon >= BGD.lonMin && lon <= BGD.lonMax;
}

function formatRSD(n) {
    return Math.round(n).toLocaleString('sr-RS') + ' RSD';
}

// Per-calculator state
const state = {
    selidba:   { items: [], pack: [], boxes: [], assembly: [], finalPrice: 0 },
    prevoz:    { items: [], assembly: [], finalPrice: 0 },
    odnosenje: { items: [], finalPrice: 0 }
};

export function switchCalc(type) {
    ['selidba','prevoz','odnosenje'].forEach(t => {
        document.getElementById('calc_' + t).style.display = t === type ? 'block' : 'none';
        document.getElementById('btn' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === type);
    });
}

// ---- Lift surcharge calculation ----
function liftSurcharge(items, floor, liftType) {
    if (floor <= 0) return 0;
    let surcharge = 0;
    items.forEach(item => {
        if (liftType === 'nema') {
            surcharge += item.price * item.qty * floor * 0.10;
        } else if (liftType === 'obicni') {
            if (item.heavy) surcharge += item.price * item.qty * floor * 0.10;
        }
    });
    return surcharge;
}

// ---- Geocode address using Nominatim ----
async function geocode(address) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address + ', Serbia');
    const r = await fetch(url, { headers: { 'Accept-Language': 'sr', 'User-Agent': 'MoveExpertWebsite/1.0' } });
    const data = await r.json();
    if (!data || !data[0]) throw new Error('Adresa nije pronađena: ' + address);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ---- Get route distance via OSRM ----
async function routeKm(lon1, lat1, lon2, lat2) {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const r = await fetch(url);
    const data = await r.json();
    return data.routes[0].distance / 1000;
}

// ---- KM calculator for Selidba / Prevoz / Odnosenje ----
async function calcKmForCalc(prefix, hasDest) {
    const addr1 = document.getElementById(prefix + '_addr1').value.trim();
    const addr2 = hasDest ? document.getElementById(prefix + '_addr2').value.trim() : null;
    const spinner = document.getElementById(prefix + '_kmSpinner');
    const display = document.getElementById(prefix + '_kmDisplay');
    const kmInput = document.getElementById(prefix + '_km');
    const rateInput = document.getElementById(prefix + '_kmRate');

    if (!addr1 || (hasDest && !addr2)) { alert('Unesite adrese.'); return; }

    spinner.style.display = 'inline-block';
    display.textContent = 'Izračunavanje...';

    try {
        const g1 = await geocode(addr1);
        const g2 = hasDest ? await geocode(addr2) : { lat: COMPANY_LAT, lon: COMPANY_LON };

        const a1InBgd = inBelgrade(g1.lat, g1.lon);
        const a2InBgd = inBelgrade(g2.lat, g2.lon);
        const rate = (a1InBgd && a2InBgd) ? 60 : 75;
        rateInput.value = rate;

        let totalKm = 0;

        if (hasDest) {
            if (!a1InBgd && !a2InBgd) {
                const d1 = await routeKm(COMPANY_LON, COMPANY_LAT, g1.lon, g1.lat);
                const d2 = await routeKm(g1.lon, g1.lat, g2.lon, g2.lat);
                const d3 = await routeKm(g2.lon, g2.lat, COMPANY_LON, COMPANY_LAT);
                totalKm = d1 + d2 + d3;
                display.textContent = `Ukupna ruta: ~${Math.round(totalKm)} km (polazak iz firme + A→B + povratak) × ${rate} RSD/km`;
            } else if (!a1InBgd && a2InBgd) {
                const d1 = await routeKm(COMPANY_LON, COMPANY_LAT, g1.lon, g1.lat);
                const d2 = await routeKm(g1.lon, g1.lat, g2.lon, g2.lat);
                totalKm = d1 + d2;
                display.textContent = `Ukupna ruta: ~${Math.round(totalKm)} km (polazak iz firme + A→B) × ${rate} RSD/km`;
            } else if (a1InBgd && !a2InBgd) {
                const d1 = await routeKm(g1.lon, g1.lat, g2.lon, g2.lat);
                const d2 = await routeKm(g2.lon, g2.lat, COMPANY_LON, COMPANY_LAT);
                totalKm = d1 + d2;
                display.textContent = `Ukupna ruta: ~${Math.round(totalKm)} km (A→B + povratak firmi) × ${rate} RSD/km`;
            } else {
                totalKm = await routeKm(g1.lon, g1.lat, g2.lon, g2.lat);
                display.textContent = `Rastojanje: ~${Math.round(totalKm)} km × ${rate} RSD/km`;
            }
        } else {
            totalKm = await routeKm(g1.lon, g1.lat, COMPANY_LON, COMPANY_LAT);
            display.textContent = `Rastojanje od firme: ~${Math.round(totalKm)} km × ${rate} RSD/km`;
        }

        kmInput.value = Math.round(totalKm);
    } catch (e) {
        display.textContent = '⚠ ' + e.message;
        console.error(e);
    } finally {
        spinner.style.display = 'none';
    }
}

function renderList(listId, arr, prefix, onRemove) {
    const ul = document.getElementById(listId);
    if (!ul) return;
    ul.innerHTML = arr.map((it, i) => `
    <li>
      <span>${it.name} × ${it.qty}</span>
      <button class="btn-remove" onclick="removeItem('${listId}',${i},'${prefix}',function(){})">✕</button>
    </li>`).join('');
}


// ---- Selidba: Lične stvari i nameštaj data ----
const selidbaLicneStvariNamestaj = [
    {
        section: 'Dnevna soba',
        items: [
            { name: 'Kauč / sofa', value: 700, heavy: true },
            { name: 'Dvosed', value: 700, heavy: true },
            { name: 'Trosed', value: 900, heavy: true },
            { name: 'Ugaona garnitura', value: 2000, heavy: true },
            { name: 'Fotelja', value: 400, heavy: true },
            { name: 'Tabure', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet (u delovima)', value: 2000, heavy: true },
            { name: 'Krevet samac', value: 1200, heavy: true },
            { name: 'Dečiji krevet', value: 1000, heavy: true },
            { name: 'Krevet na sprat', value: 3000, heavy: true },
            { name: 'Dušek bračni', value: 700, heavy: true },
            { name: 'Dušek singl', value: 500, heavy: true },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar (u komadu)', value: 700, heavy: true },
            { name: 'Mali ormar (u delovima)', value: 1000, heavy: true },
            { name: 'Srednji ormar (u komadu)', value: 1000, heavy: true },
            { name: 'Srednji ormar (u delovima)', value: 2000, heavy: true },
            { name: 'Veliki ormar (u delovima)', value: 3000, heavy: true },
            { name: 'Klizni plakar (u delovima)', value: 3000, heavy: true },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', value: 1000, heavy: true },
            { name: 'Mali regal', value: 2000, heavy: true },
            { name: 'Srednji regal', value: 3000, heavy: true },
            { name: 'Veliki regal', value: 4000, heavy: true },
            { name: 'Vitrina', value: 1500, heavy: true },
        ]
    },
    {
        section: 'Komode',
        items: [
            { name: 'Komoda velika', value: 650, heavy: true },
            { name: 'Komoda mala', value: 450, heavy: true },
            { name: 'Noćni ormarić', value: 300, heavy: true },
        ]
    },
    {
        section: 'Kuhinja i bela tehnika',
        items: [
            { name: 'Frižider', value: 1000, heavy: true },
            { name: 'Veliki frižider', value: 1500, heavy: true },
            { name: 'Side by side frižider', value: 2000, heavy: true },
            { name: 'Zamrzivač', value: 1000, heavy: true },
            { name: 'Škrinja zamrzivač', value: 1200, heavy: true },
            { name: 'Veš mašina', value: 700, heavy: true },
            { name: 'Sušilica veša', value: 700, heavy: true },
            { name: 'Mašina za sudove', value: 600, heavy: true },
            { name: 'Šporet', value: 600, heavy: true },
            { name: 'Ugradna rerna', value: 400, heavy: true },
            { name: 'Mikrotalasna', value: 200, heavy: true },
            { name: 'Aspirator', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kuhinjski elementi',
        items: [
            { name: 'Gornji kuhinjski element', value: 500, heavy: true },
            { name: 'Donji kuhinjski element', value: 800, heavy: true },
            { name: 'Kuhinjski pult', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', value: 500, heavy: true },
            { name: 'Bojler', value: 700, heavy: true },
            { name: 'Veš mašina', value: 700, heavy: true },
        ]
    },
    {
        section: 'Elektronika',
        items: [
            { name: 'TV do 55"', value: 400, heavy: true },
            { name: 'TV preko 55"', value: 600, heavy: true },
            { name: 'Laptop', value: 200, heavy: true },
            { name: 'Desktop računar', value: 220, heavy: true },
            { name: 'Monitor', value: 200, heavy: true },
            { name: 'Printer', value: 300, heavy: true },
            { name: 'Muzička linija', value: 200, heavy: true },
        ]
    },
    {
        section: 'Džakovi i specijalni predmeti',
        items: [
            { name: 'Džak šuta 25kg', value: 400, heavy: true },
            { name: 'Džak šuta 50kg', value: 700, heavy: true },
            { name: 'Putni kofer', value: 300, heavy: true },
        ]
    },
    {
        section: 'Lakši teški predmeti (do oko 100 kg)',
        items: [
            { name: 'TA peć do 100 kg', value: 2000, heavy: true },
            { name: 'Peć na pelet do 100 kg', value: 2000, heavy: true },
            { name: 'Sef do 100 kg', value: 2000, heavy: true },
            { name: 'Traka za trčanje', value: 2000, heavy: true },
            { name: 'Sobni bicikl', value: 1000, heavy: true },
            { name: 'Eliptični trenažer', value: 1500, heavy: true },
            { name: 'Veslačka sprava', value: 1200, heavy: true },
            { name: 'Profesionalna fitnes sprava do 100 kg', value: 4000, heavy: true },
            { name: 'Profesionalni frižider do 100 kg', value: 2000, heavy: true },
            { name: 'Server ormar do 100 kg', value: 2000, heavy: true },
            { name: 'Fotokopir aparat veliki do 100 kg', value: 2000, heavy: true },
            { name: 'Kotao do 100 kg', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Bicikl', value: 500, heavy: true },
            { name: 'Električni trotinet', value: 400, heavy: true },
            { name: 'Baštenski nameštaj (komad)', value: 250, heavy: true },
            { name: 'Saksija velika', value: 300, heavy: true },
            { name: 'Velika saksija sa zemljom', value: 500, heavy: true },
            { name: 'Ogledalo veliko', value: 400, heavy: true },
            { name: 'Akvarijum', value: 700, heavy: true },
            { name: 'Kolica za bebe', value: 300, heavy: true },
            { name: 'Invalidska kolica', value: 500, heavy: true },
            { name: 'Veliki roštilj', value: 800, heavy: true },
            { name: 'Klima uređaj', value: 400, heavy: true },
            { name: 'Vrata', value: 300, heavy: true },
            { name: 'Prozori', value: 300, heavy: true },
        ]
    },
];

// ---- Selidba: Streč pakovanje data ----
const selidbaStrecPakovanje = [
    {
        section: 'Garniture',
        items: [
            { name: 'Kauč / sofa', value: 300 },
            { name: 'Dvosed', value: 300 },
            { name: 'Trosed', value: 400 },
            { name: 'Ugaona garnitura', value: 700 },
            { name: 'Fotelja', value: 150 },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet', value: 500 },
            { name: 'Krevet samac', value: 300 },
            { name: 'Dečiji krevet', value: 300 },
            { name: 'Dečiji krevetac', value: 300 },
            { name: 'Krevet na sprat', value: 700 },
        ]
    },
    {
        section: 'Dušeci',
        items: [
            { name: 'Dušek singl', value: 200 },
            { name: 'Dušek bračni', value: 300 },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar', value: 300 },
            { name: 'Srednji ormar', value: 500 },
            { name: 'Veliki ormar', value: 800 },
            { name: 'Klizni plakar', value: 1000 },
            { name: 'Garderober', value: 800 },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', value: 200 },
            { name: 'Mali regal', value: 500 },
            { name: 'Srednji regal', value: 800 },
            { name: 'Veliki regal', value: 1200 },
            { name: 'Biblioteka za knjige', value: 800 },
            { name: 'Vitrina', value: 1000 },
            { name: 'Vinska vitrina', value: 1000 },
        ]
    },
    {
        section: 'Komode',
        items: [
            { name: 'Komoda mala', value: 200 },
            { name: 'Komoda velika', value: 300 },
            { name: 'Fiokar', value: 300 },
            { name: 'Komoda za presvlačenje', value: 400 },
            { name: 'Noćni ormarić', value: 100 },
            { name: 'Cipelarnik', value: 200 },
        ]
    },
    {
        section: 'Bela tehnika',
        items: [
            { name: 'Frižider', value: 300 },
            { name: 'Veliki frižider', value: 400 },
            { name: 'Side by side frižider', value: 600 },
            { name: 'Zamrzivač', value: 300 },
            { name: 'Škrinja zamrzivač', value: 400 },
            { name: 'Veš mašina', value: 250 },
            { name: 'Sušilica veša', value: 250 },
            { name: 'Mašina za sudove', value: 250 },
            { name: 'Šporet', value: 300 },
        ]
    },
    {
        section: 'Kuhinjski elementi',
        items: [
            { name: 'Gornji kuhinjski element', value: 100 },
            { name: 'Donji kuhinjski element', value: 150 },
            { name: 'Kuhinjski pult', value: 300 },
        ]
    },
    {
        section: 'Stolovi',
        items: [
            { name: 'Trpezarijski sto', value: 400 },
            { name: 'Konferencijski sto', value: 700 },
            { name: 'Ugaoni radni sto', value: 500 },
            { name: 'Radni sto', value: 300 },
            { name: 'Kompjuterski sto', value: 300 },
            { name: 'Toaletni sto', value: 300 },
            { name: 'Mali sto', value: 150 },
            { name: 'Klub sto', value: 100 },
        ]
    },
    {
        section: 'Elektronika',
        items: [
            { name: 'TV do 55"', value: 200 },
            { name: 'TV preko 55"', value: 300 },
            { name: 'Monitor', value: 100 },
            { name: 'Printer', value: 100 },
            { name: 'Sintisajzer', value: 200 },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', value: 150 },
            { name: 'Ogledalo veliko', value: 200 },
            { name: 'Radijator', value: 300, heavy: false },
        ]
    },
    {
        section: 'Dekoracija',
        items: [
            { name: 'Mala slika', value: 50 },
            { name: 'Velika slika', value: 150 },
            { name: 'Uramljeno ogledalo', value: 250 },
        ]
    },
    {
        section: 'Fitness',
        items: [
            { name: 'Traka za trčanje', value: 400 },
            { name: 'Sobni bicikl', value: 250 },
            { name: 'Eliptični trenažer', value: 300 },
            { name: 'Veslačka sprava', value: 250 },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Akvarijum', value: 300 },
            { name: 'Stalak za TV', value: 150 },
            { name: 'Velika saksija', value: 150 },
            { name: 'Gitara u koferu', value: 150 },
            { name: 'Bubnjevi', value: 300 },
        ]
    },
];

// ---- Selidba: Montaža / demontaža data ----
const selidbaAssembly = [
    {
        section: 'Garniture',
        items: [
            { name: 'Kauč / sofa', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Dvosed', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Trosed', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Ugaona garnitura (manja)', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Ugaona garnitura (velika)', disassembly: 1500, assembly: 2500, both: 4000 },
            { name: 'Fotelja sa mehanizmom', disassembly: 500, assembly: 500, both: 900 },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Bračni krevet sa podiznim mehanizmom', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Bračni krevet sa tapaciranim uzglavljem', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Krevet samac', disassembly: 800, assembly: 1000, both: 1800 },
            { name: 'Dečiji krevet', disassembly: 600, assembly: 900, both: 1500 },
            { name: 'Krevet na sprat', disassembly: 2500, assembly: 3000, both: 5500 },
            { name: 'Dečiji krevetac', disassembly: 600, assembly: 900, both: 1500 },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Srednji ormar', disassembly: 1200, assembly: 1800, both: 2800 },
            { name: 'Veliki ormar', disassembly: 2200, assembly: 2800, both: 5000 },
            { name: 'Klizni plakar', disassembly: 3000, assembly: 3500, both: 6500 },
            { name: 'Garderober', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Arhivski ormar', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Metalni ormar za dokumentaciju', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Cipelarnik', disassembly: 500, assembly: 500, both: 1000 },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Mali regal', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Srednji regal', disassembly: 1500, assembly: 2500, both: 4000 },
            { name: 'Veliki regal', disassembly: 2500, assembly: 3500, both: 6000 },
            { name: 'Biblioteka za knjige', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Vitrina', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Vinska vitrina', disassembly: 1000, assembly: 1500, both: 2500 },
        ]
    },
    {
        section: 'Komode i fiokari',
        items: [
            { name: 'Komoda velika', disassembly: 800, assembly: 1000, both: 1800 },
            { name: 'Komoda mala', disassembly: 500, assembly: 700, both: 1200 },
            { name: 'Fiokar', disassembly: 600, assembly: 900, both: 1500 },
            { name: 'Komoda za presvlačenje', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Stolovi',
        items: [
            { name: 'Trpezarijski sto', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Konferencijski sto', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Ugaoni radni sto', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Radni sto', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Kompjuterski sto', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Radni sto radionica', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Toaletni sto', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Kuhinja',
        items: [
            { name: 'Gornji kuhinjski element', disassembly: 700, assembly: 800, both: 1500 },
            { name: 'Donji kuhinjski element', disassembly: 700, assembly: 800, both: 1500 },
            { name: 'Kuhinjski pult', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', disassembly: 500, assembly: 700, both: 1200 },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Stalak za TV', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Ogradica za bebu', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Ljuljaška za terasu', disassembly: 800, assembly: 1200, both: 1800 },
            { name: 'Baštenska garnitura komplet', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Krevet za kućne ljubimce (veći modeli)', disassembly: 500, assembly: 500, both: 1000 },
        ]
    },
];

// ---- Odnosenje: Stavke data ----
const odnosenjeStavke = [
    {
        section: 'Dnevna soba',
        items: [
            { name: 'Kauč / sofa', value: 700, heavy: true },
            { name: 'Dvosed', value: 700, heavy: true },
            { name: 'Trosed', value: 700, heavy: true },
            { name: 'Ugaona garnitura', value: 1500, heavy: true },
            { name: 'Fotelja', value: 400, heavy: true },
            { name: 'Tabure', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet (u delovima)', value: 1500, heavy: true },
            { name: 'Krevet samac', value: 1000, heavy: true },
            { name: 'Dečiji krevet', value: 1000, heavy: true },
            { name: 'Krevet na sprat', value: 2500, heavy: true },
            { name: 'Dušek bračni', value: 500, heavy: true },
            { name: 'Dušek singl', value: 500, heavy: true },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar (u komadu)', value: 600, heavy: true },
            { name: 'Mali ormar (u delovima)', value: 800, heavy: true},
            { name: 'Srednji ormar (u komadu)', value: 900, heavy: true },
            { name: 'Srednji ormar (u delovima)', value: 1500, heavy: true },
            { name: 'Veliki ormar (u delovima)', value: 1500, heavy: true },
            { name: 'Klizni plakar (u delovima)', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', value: 800, heavy: true },
            { name: 'Mali regal', value: 1500, heavy: true },
            { name: 'Srednji regal', value: 2000, heavy: true },
            { name: 'Veliki regal', value: 2500, heavy: true },
            { name: 'Vitrina', value: 1500, heavy: true },
        ]
    },
    {
        section: 'Komode',
        items: [
            { name: 'Komoda velika', value: 650, heavy: true },
            { name: 'Komoda mala', value: 450, heavy: true },
            { name: 'Noćni ormarić', value: 300, heavy: true },
        ]
    },
    {
        section: 'Kuhinja i bela tehnika',
        items: [
            { name: 'Frižider', value: 1000, heavy: true },
            { name: 'Veliki frižider', value: 1500, heavy: true },
            { name: 'Side by side frižider', value: 2000, heavy: true },
            { name: 'Zamrzivač', value: 1000, heavy: true },
            { name: 'Škrinja zamrzivač', value: 1200, heavy: true },
            { name: 'Veš mašina', value: 700, heavy: true },
            { name: 'Sušilica veša', value: 700, heavy: true },
            { name: 'Mašina za sudove', value: 600, heavy: true },
            { name: 'Šporet', value: 600, heavy: true },
            { name: 'Ugradna rerna', value: 400, heavy: true },
            { name: 'Mikrotalasna', value: 200, heavy: true },
            { name: 'Aspirator', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kuhinjski elementi',
        items: [
            { name: 'Gornji kuhinjski element', value: 500, heavy: true },
            { name: 'Donji kuhinjski element', value: 800, heavy: true },
            { name: 'Kuhinjski pult', value: 1500, heavy: true },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', value: 500, heavy: true },
            { name: 'Bojler', value: 700, heavy: true },
            { name: 'Radijator', value: 300, heavy: true },
        ]
    },
    {
        section: 'Elektronika',
        items: [
            { name: 'TV do 55"', value: 400, heavy: true },
            { name: 'TV preko 55"', value: 600, heavy: true },
            { name: 'Laptop', value: 200, heavy: true },
            { name: 'Desktop računar', value: 220, heavy: true },
            { name: 'Monitor', value: 200, heavy: true },
            { name: 'Printer', value: 300, heavy: true },
            { name: 'Muzička linija', value: 200, heavy: true },
        ]
    },
    {
        section: 'Džakovi i specijalni predmeti',
        items: [
            { name: 'Džak šuta 25kg', value: 400, heavy: true },
            { name: 'Džak šuta 50kg', value: 700, heavy: true },
            { name: 'Putni kofer', value: 300, heavy: true },
        ]
    },
    {
        section: 'Lakši teški predmeti (do oko 100 kg)',
        items: [
            { name: 'TA peć do 100 kg', value: 2000, heavy: true },
            { name: 'Peć na pelet do 100 kg', value: 2000, heavy: true },
            { name: 'Sef do 100 kg', value: 2000, heavy: true },
            { name: 'Traka za trčanje', value: 2000, heavy: true },
            { name: 'Sobni bicikl', value: 1000, heavy: true },
            { name: 'Eliptični trenažer', value: 1500, heavy: true },
            { name: 'Veslačka sprava', value: 1200, heavy: true },
            { name: 'Profesionalna fitnes sprava do 100 kg', value: 4000, heavy: true },
            { name: 'Profesionalni frižider do 100 kg', value: 2000, heavy: true },
            { name: 'Server ormar do 100 kg', value: 2000, heavy: true },
            { name: 'Fotokopir aparat veliki do 100 kg', value: 2000, heavy: true },
            { name: 'Kotao do 100 kg', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Bicikl', value: 500, heavy: true },
            { name: 'Električni trotinet', value: 400, heavy: true },
            { name: 'Baštenski nameštaj (komad)', value: 250, heavy: true },
            { name: 'Saksija velika', value: 300, heavy: true },
            { name: 'Velika saksija sa zemljom', value: 500, heavy: true },
            { name: 'Ogledalo veliko', value: 400, heavy: true },
            { name: 'Akvarijum', value: 700, heavy: true },
            { name: 'Kolica za bebe', value: 300, heavy: true },
            { name: 'Invalidska kolica', value: 500, heavy: true },
            { name: 'Veliki roštilj', value: 800, heavy: true },
            { name: 'Klima uređaj', value: 400, heavy: true },
            { name: 'Vrata', value: 300, heavy: true },
            { name: 'Prozori', value: 300, heavy: true },
        ]
    },
];

// ---- Prevoz: Stavke za prevoz data ----
const prevozStavke = [
    {
        section: 'Dnevna soba',
        items: [
            { name: 'Kauč / sofa', value: 700, heavy: true },
            { name: 'Dvosed', value: 700, heavy: true },
            { name: 'Trosed', value: 900, heavy: true },
            { name: 'Ugaona garnitura', value: 2000, heavy: true },
            { name: 'Fotelja', value: 400, heavy: true },
            { name: 'Tabure', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet (u delovima)', value: 2000, heavy: true },
            { name: 'Krevet samac', value: 1200, heavy: true },
            { name: 'Dečiji krevet', value: 1000, heavy: true },
            { name: 'Krevet na sprat', value: 3000, heavy: true },
            { name: 'Dušek bračni', value: 700, heavy: true },
            { name: 'Dušek singl', value: 500, heavy: true },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar (u komadu)', value: 700, heavy: true },
            { name: 'Mali ormar (u delovima)', value: 1000, heavy: true },
            { name: 'Srednji ormar (u komadu)', value: 1000, heavy: true },
            { name: 'Srednji ormar (u delovima)', value: 2000, heavy: true },
            { name: 'Veliki ormar (u delovima)', value: 3000, heavy: true },
            { name: 'Klizni plakar (u delovima)', value: 3000, heavy: true },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', value: 1000, heavy: true },
            { name: 'Mali regal', value: 2000, heavy: true },
            { name: 'Srednji regal', value: 3000, heavy: true },
            { name: 'Veliki regal', value: 4000, heavy: true },
            { name: 'Vitrina', value: 1500, heavy: true },
        ]
    },
    {
        section: 'Komode',
        items: [
            { name: 'Komoda velika', value: 650, heavy: true },
            { name: 'Komoda mala', value: 450, heavy: true },
            { name: 'Noćni ormarić', value: 300, heavy: true },
        ]
    },
    {
        section: 'Kuhinja i bela tehnika',
        items: [
            { name: 'Frižider', value: 1000, heavy: true },
            { name: 'Veliki frižider', value: 1500, heavy: true },
            { name: 'Side by side frižider', value: 2000, heavy: true },
            { name: 'Zamrzivač', value: 1000, heavy: true },
            { name: 'Škrinja zamrzivač', value: 1200, heavy: true },
            { name: 'Veš mašina', value: 700, heavy: true },
            { name: 'Sušilica veša', value: 700, heavy: true },
            { name: 'Mašina za sudove', value: 600, heavy: true },
            { name: 'Šporet', value: 600, heavy: true },
            { name: 'Ugradna rerna', value: 400, heavy: true },
            { name: 'Mikrotalasna', value: 200, heavy: true },
            { name: 'Aspirator', value: 200, heavy: true },
        ]
    },
    {
        section: 'Kuhinjski elementi',
        items: [
            { name: 'Gornji kuhinjski element', value: 500, heavy: true },
            { name: 'Donji kuhinjski element', value: 800, heavy: true },
            { name: 'Kuhinjski pult', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', value: 500, heavy: true },
            { name: 'Bojler', value: 700, heavy: true },
            { name: 'Radijator', value: 300, heavy: true },
        ]
    },
    {
        section: 'Elektronika',
        items: [
            { name: 'TV do 55"', value: 400, heavy: true },
            { name: 'TV preko 55"', value: 600, heavy: true },
            { name: 'Laptop', value: 200, heavy: true },
            { name: 'Desktop računar', value: 220, heavy: true },
            { name: 'Monitor', value: 200, heavy: true },
            { name: 'Printer', value: 300, heavy: true },
            { name: 'Muzička linija', value: 200, heavy: true },
        ]
    },
    {
        section: 'Džakovi i specijalni predmeti',
        items: [
            { name: 'Džak šuta 25kg', value: 400, heavy: true },
            { name: 'Džak šuta 50kg', value: 700, heavy: true },
            { name: 'Putni kofer', value: 300, heavy: true },
        ]
    },
    {
        section: 'Lakši teški predmeti (do oko 100 kg)',
        items: [
            { name: 'TA peć do 100 kg', value: 2000, heavy: true },
            { name: 'Peć na pelet do 100 kg', value: 2000, heavy: true },
            { name: 'Sef do 100 kg', value: 2000, heavy: true },
            { name: 'Traka za trčanje', value: 2000, heavy: true },
            { name: 'Sobni bicikl', value: 1000, heavy: true },
            { name: 'Eliptični trenažer', value: 1500, heavy: true },
            { name: 'Veslačka sprava', value: 1200, heavy: true },
            { name: 'Profesionalna fitnes sprava do 100 kg', value: 4000, heavy: true },
            { name: 'Profesionalni frižider do 100 kg', value: 2000, heavy: true },
            { name: 'Server ormar do 100 kg', value: 2000, heavy: true },
            { name: 'Fotokopir aparat veliki do 100 kg', value: 2000, heavy: true },
            { name: 'Kotao do 100 kg', value: 2000, heavy: true },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Bicikl', value: 500, heavy: true },
            { name: 'Električni trotinet', value: 400, heavy: true },
            { name: 'Baštenski nameštaj (komad)', value: 250, heavy: true },
            { name: 'Saksija velika', value: 300, heavy: true },
            { name: 'Velika saksija sa zemljom', value: 500, heavy: true },
            { name: 'Ogledalo veliko', value: 400, heavy: true },
            { name: 'Akvarijum', value: 700, heavy: true },
            { name: 'Kolica za bebe', value: 300, heavy: true },
            { name: 'Invalidska kolica', value: 500, heavy: true },
            { name: 'Veliki roštilj', value: 800, heavy: true },
            { name: 'Klima uređaj', value: 400, heavy: true },
            { name: 'Vrata', value: 300, heavy: true },
            { name: 'Prozori', value: 300, heavy: true },
        ]
    },
];

// ---- Prevoz: Montaža / demontaža data ----
const prevozAssembly = [
    {
        section: 'Garniture',
        items: [
            { name: 'Kauč / sofa', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Dvosed', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Trosed', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Ugaona garnitura (manja)', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Ugaona garnitura (velika)', disassembly: 1500, assembly: 2500, both: 4000 },
            { name: 'Fotelja sa mehanizmom', disassembly: 500, assembly: 500, both: 900 },
        ]
    },
    {
        section: 'Kreveti',
        items: [
            { name: 'Bračni krevet', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Bračni krevet sa podiznim mehanizmom', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Bračni krevet sa tapaciranim uzglavljem', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Krevet samac', disassembly: 800, assembly: 1000, both: 1800 },
            { name: 'Dečiji krevet', disassembly: 600, assembly: 900, both: 1500 },
            { name: 'Krevet na sprat', disassembly: 2500, assembly: 3000, both: 5500 },
            { name: 'Dečiji krevetac', disassembly: 600, assembly: 900, both: 1500 },
        ]
    },
    {
        section: 'Ormari',
        items: [
            { name: 'Mali ormar', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Srednji ormar', disassembly: 1200, assembly: 1800, both: 2800 },
            { name: 'Veliki ormar', disassembly: 2200, assembly: 2800, both: 5000 },
            { name: 'Klizni plakar', disassembly: 3000, assembly: 3500, both: 6500 },
            { name: 'Garderober', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Arhivski ormar', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Metalni ormar za dokumentaciju', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Cipelarnik', disassembly: 500, assembly: 500, both: 1000 },
        ]
    },
    {
        section: 'Regali i police',
        items: [
            { name: 'Mala polica', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Mali regal', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Srednji regal', disassembly: 1500, assembly: 2500, both: 4000 },
            { name: 'Veliki regal', disassembly: 2500, assembly: 3500, both: 6000 },
            { name: 'Biblioteka za knjige', disassembly: 2000, assembly: 3000, both: 5000 },
            { name: 'Vitrina', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Vinska vitrina', disassembly: 1000, assembly: 1500, both: 2500 },
        ]
    },
    {
        section: 'Komode i fiokari',
        items: [
            { name: 'Komoda velika', disassembly: 800, assembly: 1000, both: 1800 },
            { name: 'Komoda mala', disassembly: 500, assembly: 700, both: 1200 },
            { name: 'Fiokar', disassembly: 600, assembly: 900, both: 1500 },
            { name: 'Komoda za presvlačenje', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Stolovi',
        items: [
            { name: 'Trpezarijski sto', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Konferencijski sto', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Ugaoni radni sto', disassembly: 1000, assembly: 1500, both: 2500 },
            { name: 'Radni sto', disassembly: 600, assembly: 1000, both: 1600 },
            { name: 'Kompjuterski sto', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Radni sto radionica', disassembly: 1000, assembly: 2000, both: 3000 },
            { name: 'Toaletni sto', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Kuhinja',
        items: [
            { name: 'Gornji kuhinjski element', disassembly: 700, assembly: 800, both: 1500 },
            { name: 'Donji kuhinjski element', disassembly: 700, assembly: 800, both: 1500 },
            { name: 'Kuhinjski pult', disassembly: 800, assembly: 1200, both: 2000 },
        ]
    },
    {
        section: 'Kupatilo',
        items: [
            { name: 'Kupatilski ormarić', disassembly: 500, assembly: 700, both: 1200 },
        ]
    },
    {
        section: 'Ostalo',
        items: [
            { name: 'Stalak za TV', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Ogradica za bebu', disassembly: 500, assembly: 500, both: 1000 },
            { name: 'Ljuljaška za terasu', disassembly: 800, assembly: 1200, both: 1800 },
            { name: 'Baštenska garnitura komplet', disassembly: 800, assembly: 1200, both: 2000 },
            { name: 'Krevet za kućne ljubimce (veći modeli)', disassembly: 500, assembly: 500, both: 1000 },
        ]
    },
];


function populateSectionSelect() {
    const sectionSel = document.getElementById('s_section');
    sectionSel.innerHTML = selidbaLicneStvariNamestaj
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populateItemSelect();
}

function populateItemSelect() {
    const sectionSel = document.getElementById('s_section');
    const itemSel = document.getElementById('s_item');
    const section = selidbaLicneStvariNamestaj.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items
        .map(it => `<option value="${it.value}" data-heavy="${it.heavy ? '1' : '0'}">${it.name} (${it.value.toLocaleString('sr-RS')} RSD)</option>`)
        .join('');
}

function populateOdnosenjeSectionSelect() {
    const sectionSel = document.getElementById('o_section');
    sectionSel.innerHTML = odnosenjeStavke
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populateOdnosenjeItemSelect();
}

function populateOdnosenjeItemSelect() {
    const sectionSel = document.getElementById('o_section');
    const itemSel = document.getElementById('o_item');
    const section = odnosenjeStavke.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items
        .map(it => `<option value="${it.value}" data-heavy="${it.heavy ? '1' : '0'}">${it.name} (${it.value.toLocaleString('sr-RS')} RSD)</option>`)
        .join('');
}

function populatePrevozSectionSelect() {
    const sectionSel = document.getElementById('p_section');
    sectionSel.innerHTML = prevozStavke
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populatePrevozItemSelect();
}

function populatePrevozItemSelect() {
    const sectionSel = document.getElementById('p_section');
    const itemSel = document.getElementById('p_item');
    const section = prevozStavke.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items
        .map(it => `<option value="${it.value}" data-heavy="${it.heavy ? '1' : '0'}">${it.name} (${it.value.toLocaleString('sr-RS')} RSD)</option>`)
        .join('');
}

function populatePrevozAssemblySectionSelect() {
    const sectionSel = document.getElementById('p_assemblySection');
    sectionSel.innerHTML = prevozAssembly
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populatePrevozAssemblyItemSelect();
}

function populatePrevozAssemblyItemSelect() {
    const sectionSel = document.getElementById('p_assemblySection');
    const itemSel = document.getElementById('p_assemblyItem');
    const section = prevozAssembly.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items.flatMap((it, i, arr) => [
        `<option value="${it.disassembly}">${it.name} - Demontaža (${it.disassembly.toLocaleString('sr-RS')} RSD)</option>`,
        `<option value="${it.assembly}">${it.name} - Montaža (${it.assembly.toLocaleString('sr-RS')} RSD)</option>`,
        `<option value="${it.both}">${it.name} - Demontaža + Montaža (${it.both.toLocaleString('sr-RS')} RSD)</option>`,
        ...(i < arr.length - 1 ? ['<option disabled>────────────────</option>'] : []),
    ]).join('');
}

function populateAssemblySectionSelect() {
    const sectionSel = document.getElementById('s_assemblySection');
    sectionSel.innerHTML = selidbaAssembly
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populateAssemblyItemSelect();
}

function populateAssemblyItemSelect() {
    const sectionSel = document.getElementById('s_assemblySection');
    const itemSel = document.getElementById('s_assemblyItem');
    const section = selidbaAssembly.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items.flatMap((it, i, arr) => [
        `<option value="${it.disassembly}">${it.name} - Demontaža (${it.disassembly.toLocaleString('sr-RS')} RSD)</option>`,
        `<option value="${it.assembly}">${it.name} - Montaža (${it.assembly.toLocaleString('sr-RS')} RSD)</option>`,
        `<option value="${it.both}">${it.name} - Demontaža + Montaža (${it.both.toLocaleString('sr-RS')} RSD)</option>`,
        ...(i < arr.length - 1 ? ['<option disabled>────────────────</option>'] : []),
    ]).join('');
}

function populatePackSectionSelect() {
    const sectionSel = document.getElementById('s_packSection');
    sectionSel.innerHTML = selidbaStrecPakovanje
        .map(s => `<option value="${s.section}">${s.section}</option>`)
        .join('');
    populatePackItemSelect();
}

function populatePackItemSelect() {
    const sectionSel = document.getElementById('s_packSection');
    const itemSel = document.getElementById('s_packItem');
    const section = selidbaStrecPakovanje.find(s => s.section === sectionSel.value);
    if (!section) return;
    itemSel.innerHTML = section.items
        .map(it => `<option value="${it.value}">${it.name} (${it.value.toLocaleString('sr-RS')} RSD)</option>`)
        .join('');
}

// ---- SELIDBA ----
// Bail out on pages without the calculator markup.
if (!document.getElementById('s_addItem')) {
    // no-op import side effect
} else initCalculator();

function initCalculator() {
populateSectionSelect();
document.getElementById('s_section').addEventListener('change', populateItemSelect);
populatePackSectionSelect();
document.getElementById('s_packSection').addEventListener('change', populatePackItemSelect);
populateAssemblySectionSelect();
document.getElementById('s_assemblySection').addEventListener('change', populateAssemblyItemSelect);
populateOdnosenjeSectionSelect();
document.getElementById('o_section').addEventListener('change', populateOdnosenjeItemSelect);
populatePrevozSectionSelect();
document.getElementById('p_section').addEventListener('change', populatePrevozItemSelect);
populatePrevozAssemblySectionSelect();
document.getElementById('p_assemblySection').addEventListener('change', populatePrevozAssemblyItemSelect);
function renderSelidbaLists() {
    renderList('s_itemsList',    state.selidba.items,    's_items',    ()=>{});
    renderList('s_packList',     state.selidba.pack,     's_pack',     ()=>{});
    renderList('s_boxList',      state.selidba.boxes,    's_boxes',    ()=>{});
    renderList('s_assemblyList', state.selidba.assembly, 's_assembly', ()=>{});
}

document.getElementById('s_addItem').addEventListener('click', function() {
    const sel = document.getElementById('s_item');
    const qty = parseInt(document.getElementById('s_qty').value) || 0;
    if (qty <= 0) { alert('Izaberite količinu (minimum 1).'); return; }
    const price = parseInt(sel.value);
    const heavy = sel.options[sel.selectedIndex].dataset.heavy === '1';
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.selidba.items;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty, heavy });
    document.getElementById('s_qty').value = 1;
    renderSelidbaLists();
});

document.getElementById('s_addPack').addEventListener('click', function() {
    const sel = document.getElementById('s_packItem');
    const qty = parseInt(document.getElementById('s_packQty').value) || 0;
    if (qty <= 0) { alert('Izaberite količinu.'); return; }
    const price = parseInt(sel.value);
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.selidba.pack;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty });
    document.getElementById('s_packQty').value = 1;
    renderSelidbaLists();
});

document.getElementById('s_addBox').addEventListener('click', function() {
    const sel = document.getElementById('s_boxType');
    const qty = parseInt(document.getElementById('s_boxes').value) || 0;
    if (parseInt(sel.value) === 0) { alert('Izaberite veličinu kutije.'); return; }
    if (qty <= 0) { alert('Unesite broj kutija.'); return; }
    const price = parseInt(sel.value);
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.selidba.boxes;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty });
    document.getElementById('s_boxes').value = 1;
    renderSelidbaLists();
});

document.getElementById('s_addAssembly').addEventListener('click', function() {
    const sel = document.getElementById('s_assemblyItem');
    const qty = parseInt(document.getElementById('s_assemblyQty').value) || 0;
    if (qty <= 0) { alert('Unesite količinu.'); return; }
    const price = parseInt(sel.value);
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.selidba.assembly;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty });
    document.getElementById('s_assemblyQty').value = 1;
    renderSelidbaLists();
});

['s_itemsList','s_packList','s_boxList','s_assemblyList'].forEach(id => {
    document.getElementById(id).addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-remove')) {
            const li = e.target.closest('li');
            const idx = Array.from(this.children).indexOf(li);
            const map = {s_itemsList:'items',s_packList:'pack',s_boxList:'boxes',s_assemblyList:'assembly'};
            state.selidba[map[id]].splice(idx, 1);
            renderSelidbaLists();
        }
    });
});

document.getElementById('s_calcBtn').addEventListener('click', function() {
    const sprat1 = parseInt(document.getElementById('s_sprat1').value) || 0;
    const sprat2 = parseInt(document.getElementById('s_sprat2').value) || 0;
    const lift1 = document.getElementById('s_lift1').value;
    const lift2 = document.getElementById('s_lift2').value;

    if (sprat1 > 0 && !lift1) { alert('Izaberite tip lifta za polaznu adresu.'); return; }
    if (sprat2 > 0 && !lift2) { alert('Izaberite tip lifta za odredišnu adresu.'); return; }
    if (state.selidba.items.length === 0) { alert('Dodajte barem jednu stavku u "Lične stvari i nameštaj".'); return; }

    const vozilo = parseInt(document.getElementById('s_vozilo').value);
    const voziloQty = parseInt(document.getElementById('s_voziloQty').value) || 1;
    const km = parseInt(document.getElementById('s_km').value) || 0;
    const rate = parseInt(document.getElementById('s_kmRate').value) || 60;
    const distPct = parseInt(document.getElementById('s_kombDistance').value) || 0;

    const cenaVozilo = vozilo * voziloQty;
    const cenaKm = km * rate;

    let itemsTotal = state.selidba.items.reduce((s, i) => s + i.price * i.qty, 0);
    const packTotal = state.selidba.pack.reduce((s, i) => s + i.price * i.qty, 0);
    const boxTotal  = state.selidba.boxes.reduce((s, i) => s + i.price * i.qty, 0);
    const asmTotal  = state.selidba.assembly.reduce((s, i) => s + i.price * i.qty, 0);

    const liftSurch1 = liftSurcharge(state.selidba.items, sprat1, lift1 || 'teretni');
    const liftSurch2 = liftSurcharge(state.selidba.items, sprat2, lift2 || 'teretni');

    const base = cenaVozilo + cenaKm + itemsTotal + packTotal + boxTotal + asmTotal + liftSurch1 + liftSurch2;
    const workers = Math.round(base * 0.25);
    const afterWorkers = base + workers;
    const final = Math.round(afterWorkers * (1 + distPct / 100));

    state.selidba.finalPrice = final;

    document.getElementById('s_price').textContent = formatRSD(final);

    const bd = document.getElementById('s_breakdown');
    bd.innerHTML = `
    <div class="breakdown-row"><span>Vozilo (${voziloQty}×)</span><span>${formatRSD(cenaVozilo)}</span></div>
    ${km > 0 ? `<div class="breakdown-row"><span>Kilometraža (${km} km × ${rate} RSD)</span><span>${formatRSD(cenaKm)}</span></div>` : ''}
    ${itemsTotal > 0 ? `<div class="breakdown-row"><span>Stavke</span><span>${formatRSD(itemsTotal)}</span></div>` : ''}
    ${(liftSurch1 + liftSurch2) > 0 ? `<div class="breakdown-row"><span>Doplate za lift/sprat</span><span>${formatRSD(liftSurch1 + liftSurch2)}</span></div>` : ''}
    ${packTotal > 0 ? `<div class="breakdown-row"><span>Streč pakovanje</span><span>${formatRSD(packTotal)}</span></div>` : ''}
    ${boxTotal > 0 ? `<div class="breakdown-row"><span>Kutije</span><span>${formatRSD(boxTotal)}</span></div>` : ''}
    ${asmTotal > 0 ? `<div class="breakdown-row"><span>Montaža/demontaža</span><span>${formatRSD(asmTotal)}</span></div>` : ''}
    ${distPct > 0 ? `<div class="breakdown-row"><span>Udaljenost kombija od ulaza (+${distPct}%)</span><span>+${formatRSD(afterWorkers * distPct / 100)}</span></div>` : ''}
    <div class="breakdown-row"><span>Radnici (+25%)</span><span>+${formatRSD(workers)}</span></div>
    <div class="breakdown-row total"><span>Procena ukupno</span><span>${formatRSD(final)}</span></div>
  `;

    const resultEl = document.getElementById('s_result');
    resultEl.classList.add('visible');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('s_contactForm').style.display = 'block';
});

document.getElementById('s_calcKm').addEventListener('click', () => calcKmForCalc('s', true));

document.getElementById('s_sendWhats').addEventListener('click', function() {
    const ime = document.getElementById('s_ime').value.trim();
    const prezime = document.getElementById('s_prezime').value.trim();
    const telefon = document.getElementById('s_telefon').value.trim();
    const datum = document.getElementById('s_datum').value;
    if (!ime || !prezime || !telefon) { alert('Popunite ime, prezime i telefon.'); return; }

    const items = state.selidba.items.map(i => i.name + ' ×' + i.qty).join(', ') || '—';
    const pack  = state.selidba.pack.map(i  => i.name + ' ×' + i.qty).join(', ') || '—';
    const boxes = state.selidba.boxes.map(i => i.name + ' ×' + i.qty).join(', ') || '—';
    const asm   = state.selidba.assembly.map(i => i.name + ' ×' + i.qty).join(', ') || '—';

    const msg = encodeURIComponent(
        `Zdravo, zanima me cena selidbe.\n` +
        `Ime: ${ime} ${prezime}\nTelefon: ${telefon}\n` +
        `${datum ? 'Datum: ' + datum + '\n' : ''}` +
        `Adresa preuzimanja: ${document.getElementById('s_addr1').value || '—'}\n` +
        `Adresa dostave: ${document.getElementById('s_addr2').value || '—'}\n` +
        `Stavke: ${items}\nStreč pakovanje: ${pack}\nKutije: ${boxes}\nMontaža: ${asm}\n` +
        `Procena: ${formatRSD(state.selidba.finalPrice)}`
    );
    window.open('https://wa.me/381659410699?text=' + msg, '_blank');
});

// ---- PREVOZ ROBE ----
document.getElementById('p_addItem').addEventListener('click', function() {
    const sel = document.getElementById('p_item');
    const qty = parseInt(document.getElementById('p_qty').value) || 0;
    if (qty <= 0) { alert('Izaberite količinu.'); return; }
    const price = parseInt(sel.value);
    const heavy = sel.options[sel.selectedIndex].dataset.heavy === '1';
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.prevoz.items;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty, heavy });
    document.getElementById('p_qty').value = 1;
    renderList('p_itemsList', arr, 'p_items', ()=>{});
});
document.getElementById('p_itemsList').addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-remove')) {
        const idx = Array.from(this.children).indexOf(e.target.closest('li'));
        state.prevoz.items.splice(idx, 1);
        renderList('p_itemsList', state.prevoz.items, 'p_items', ()=>{});
    }
});
document.getElementById('p_calcKm').addEventListener('click', () => calcKmForCalc('p', true));

document.getElementById('p_addAssembly').addEventListener('click', function() {
    const sel = document.getElementById('p_assemblyItem');
    const qty = parseInt(document.getElementById('p_assemblyQty').value) || 0;
    if (qty <= 0) { alert('Unesite količinu.'); return; }
    const price = parseInt(sel.value);
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.prevoz.assembly;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty });
    document.getElementById('p_assemblyQty').value = 1;
    renderList('p_assemblyList', arr, 'p_assembly', () => {});
});

document.getElementById('p_assemblyList').addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-remove')) {
        const idx = Array.from(this.children).indexOf(e.target.closest('li'));
        state.prevoz.assembly.splice(idx, 1);
        renderList('p_assemblyList', state.prevoz.assembly, 'p_assembly', () => {});
    }
});

document.getElementById('p_calcBtn').addEventListener('click', function() {
    const sprat1 = parseInt(document.getElementById('p_sprat1').value) || 0;
    const sprat2 = parseInt(document.getElementById('p_sprat2').value) || 0;
    const lift1 = document.getElementById('p_lift1').value;
    const lift2 = document.getElementById('p_lift2').value;
    if (sprat1 > 0 && !lift1) { alert('Izaberite tip lifta za polaznu adresu.'); return; }
    if (sprat2 > 0 && !lift2) { alert('Izaberite tip lifta za odredišnu adresu.'); return; }
    if (state.prevoz.items.length === 0) { alert('Dodajte barem jednu stavku.'); return; }

    const vozilo = parseInt(document.getElementById('p_vozilo').value);
    const voziloQty = parseInt(document.getElementById('p_voziloQty').value) || 1;
    const km = parseInt(document.getElementById('p_km').value) || 0;
    const rate = parseInt(document.getElementById('p_kmRate').value) || 60;
    const cenaVozilo = vozilo * voziloQty;
    const cenaKm = km * rate;
    const itemsTotal = state.prevoz.items.reduce((s, i) => s + i.price * i.qty, 0);
    const asmTotal = state.prevoz.assembly.reduce((s, i) => s + i.price * i.qty, 0);
    const ls1 = liftSurcharge(state.prevoz.items, sprat1, lift1 || 'teretni');
    const ls2 = liftSurcharge(state.prevoz.items, sprat2, lift2 || 'teretni');
    const base = cenaVozilo + cenaKm + itemsTotal + asmTotal + ls1 + ls2;
    const workers = Math.round(base * 0.25);
    const final = base + workers;
    state.prevoz.finalPrice = final;

    document.getElementById('p_price').textContent = formatRSD(final);
    const bd = document.getElementById('p_breakdown');
    bd.innerHTML = `
    <div class="breakdown-row"><span>Vozilo (${voziloQty}×)</span><span>${formatRSD(cenaVozilo)}</span></div>
    ${km > 0 ? `<div class="breakdown-row"><span>Kilometraža (${km} km × ${rate} RSD)</span><span>${formatRSD(cenaKm)}</span></div>` : ''}
    ${itemsTotal > 0 ? `<div class="breakdown-row"><span>Stavke</span><span>${formatRSD(itemsTotal)}</span></div>` : ''}
    ${(ls1+ls2) > 0 ? `<div class="breakdown-row"><span>Doplate za lift/sprat</span><span>${formatRSD(ls1+ls2)}</span></div>` : ''}
    ${asmTotal > 0 ? `<div class="breakdown-row"><span>Montaža/demontaža</span><span>${formatRSD(asmTotal)}</span></div>` : ''}
    <div class="breakdown-row"><span>Radnici (+25%)</span><span>+${formatRSD(workers)}</span></div>
    <div class="breakdown-row total"><span>Procena ukupno</span><span>${formatRSD(final)}</span></div>
  `;
    const res = document.getElementById('p_result');
    res.classList.add('visible');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('p_contactForm').style.display = 'block';
});

document.getElementById('p_sendWhats').addEventListener('click', function() {
    const ime = document.getElementById('p_ime').value.trim();
    const tel = document.getElementById('p_telefon').value.trim();
    if (!ime || !tel) { alert('Popunite ime i telefon.'); return; }
    const items = state.prevoz.items.map(i => i.name + ' ×' + i.qty).join(', ') || '—';
    const asm = state.prevoz.assembly.map(i => i.name + ' ×' + i.qty).join(', ') || '—';
    const msg = encodeURIComponent(`Zdravo, zanima me cena prevoza robe.\nIme: ${ime}\nTelefon: ${tel}\nStavke: ${items}\nMontaža: ${asm}\nProcena: ${formatRSD(state.prevoz.finalPrice)}`);
    window.open('https://wa.me/381659410699?text=' + msg, '_blank');
});

// ---- ODNOSENJE ----
document.getElementById('o_addItem').addEventListener('click', function() {
    const sel = document.getElementById('o_item');
    const qty = parseInt(document.getElementById('o_qty').value) || 0;
    if (qty <= 0) { alert('Izaberite količinu.'); return; }
    const price = parseInt(sel.value);
    const heavy = sel.options[sel.selectedIndex].dataset.heavy === '1';
    const name = sel.options[sel.selectedIndex].text;
    const arr = state.odnosenje.items;
    const ex = arr.find(x => x.name === name);
    if (ex) ex.qty += qty; else arr.push({ name, price, qty, heavy });
    document.getElementById('o_qty').value = 1;
    renderList('o_itemsList', arr, 'o_items', ()=>{});
});
document.getElementById('o_itemsList').addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-remove')) {
        const idx = Array.from(this.children).indexOf(e.target.closest('li'));
        state.odnosenje.items.splice(idx, 1);
        renderList('o_itemsList', state.odnosenje.items, 'o_items', ()=>{});
    }
});
document.getElementById('o_calcKm').addEventListener('click', () => calcKmForCalc('o', false));

document.getElementById('o_calcBtn').addEventListener('click', function() {
    const sprat1 = parseInt(document.getElementById('o_sprat1').value) || 0;
    const lift1 = document.getElementById('o_lift1').value;
    if (sprat1 > 0 && !lift1) { alert('Izaberite tip lifta.'); return; }
    if (state.odnosenje.items.length === 0) { alert('Dodajte barem jednu stavku.'); return; }

    const vozilo = parseInt(document.getElementById('o_vozilo').value);
    const voziloQty = parseInt(document.getElementById('o_voziloQty').value) || 1;
    const km = parseInt(document.getElementById('o_km').value) || 0;
    const rate = parseInt(document.getElementById('o_kmRate').value) || 60;
    const cenaVozilo = vozilo * voziloQty;
    const cenaKm = km * rate;
    const itemsTotal = state.odnosenje.items.reduce((s, i) => s + i.price * i.qty, 0);
    const ls = liftSurcharge(state.odnosenje.items, sprat1, lift1 || 'teretni');
    const base = cenaVozilo + cenaKm + itemsTotal + ls;
    const workers = Math.round(base * 0.25);
    const final = base + workers;
    state.odnosenje.finalPrice = final;

    document.getElementById('o_price').textContent = formatRSD(final);
    const bd = document.getElementById('o_breakdown');
    bd.innerHTML = `
    <div class="breakdown-row"><span>Vozilo (${voziloQty}×)</span><span>${formatRSD(cenaVozilo)}</span></div>
    ${km > 0 ? `<div class="breakdown-row"><span>Kilometraža (${km} km × ${rate} RSD)</span><span>${formatRSD(cenaKm)}</span></div>` : ''}
    <div class="breakdown-row"><span>Stavke</span><span>${formatRSD(itemsTotal)}</span></div>
    ${ls > 0 ? `<div class="breakdown-row"><span>Doplate za lift/sprat</span><span>${formatRSD(ls)}</span></div>` : ''}
    <div class="breakdown-row"><span>Radnici (+25%)</span><span>+${formatRSD(workers)}</span></div>
    <div class="breakdown-row total"><span>Procena ukupno</span><span>${formatRSD(final)}</span></div>
  `;
    const res = document.getElementById('o_result');
    res.classList.add('visible');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('o_contactForm').style.display = 'block';
});

document.getElementById('o_sendWhats').addEventListener('click', function() {
    const ime = document.getElementById('o_ime').value.trim();
    const tel = document.getElementById('o_telefon').value.trim();
    if (!ime || !tel) { alert('Popunite ime i telefon.'); return; }
    const items = state.odnosenje.items.map(i => i.name + ' ×' + i.qty).join(', ') || '—';
    const msg = encodeURIComponent(`Zdravo, zanima me cena odnošenja nameštaja.\nIme: ${ime}\nTelefon: ${tel}\nStavke: ${items}\nProcena: ${formatRSD(state.odnosenje.finalPrice)}`);
    window.open('https://wa.me/381659410699?text=' + msg, '_blank');
});

// Clamp floor inputs to 0–20
['s_sprat1','s_sprat2','p_sprat1','p_sprat2','o_sprat1'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
        if (this.value === '') return;
        let v = parseInt(this.value);
        if (isNaN(v)) return;
        if (v < 0) this.value = 0;
        else if (v > 20) this.value = 20;
    });
    el.addEventListener('blur', function() {
        let v = parseInt(this.value);
        if (isNaN(v) || v < 0) this.value = 0;
        else if (v > 20) this.value = 20;
    });
});

// Clamp quantity inputs to 0–100
['s_qty','s_packQty','s_boxes','s_assemblyQty','p_qty','p_assemblyQty','o_qty'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
        if (this.value === '') return;
        let v = parseInt(this.value);
        if (isNaN(v)) return;
        if (v < 0) this.value = 0;
        else if (v > 100) this.value = 100;
    });
    el.addEventListener('blur', function() {
        let v = parseInt(this.value);
        if (isNaN(v) || v < 0) this.value = 0;
        else if (v > 100) this.value = 100;
    });
});

// Set min date for date inputs
const today = new Date().toISOString().split('T')[0];
['s_datum','p_datum','o_datum'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('min', today);
});
} // end initCalculator
