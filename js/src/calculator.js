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
    prevoz:    { items: [], finalPrice: 0 },
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

// ---- SELIDBA ----
// Bail out on pages without the calculator markup.
if (!document.getElementById('s_addItem')) {
    // no-op import side effect
} else initCalculator();

function initCalculator() {
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
    if (parseInt(sel.value) === 0) { alert('Izaberite tip streč pakovanja.'); return; }
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
    if (parseInt(sel.value) === 0) { alert('Izaberite tip montaže.'); return; }
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
    const ls1 = liftSurcharge(state.prevoz.items, sprat1, lift1 || 'teretni');
    const ls2 = liftSurcharge(state.prevoz.items, sprat2, lift2 || 'teretni');
    const base = cenaVozilo + cenaKm + itemsTotal + ls1 + ls2;
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
    const msg = encodeURIComponent(`Zdravo, zanima me cena prevoza robe.\nIme: ${ime}\nTelefon: ${tel}\nStavke: ${items}\nProcena: ${formatRSD(state.prevoz.finalPrice)}`);
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
['s_qty','s_packQty','s_boxes','s_assemblyQty','p_qty','o_qty'].forEach(id => {
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
