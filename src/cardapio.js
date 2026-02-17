import { db } from './firebase-config.js'; 
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const userId = params.get('id');

// --- ESTADO GLOBAL ---
let whatsappLoja = ""; 
let configHorario = { abertura: "", fechamento: "" };
let configEntrega = { coords: {lat: 0, log: 0}, raioMaximo: 0, valorKm: 0, tipo: 'fixo', taxaFixa: 0 }; 

let carrinho = [];
let taxaEntregaAtual = 0;
let distanciaCliente = 0; 
let modoPedido = 'entrega'; 
let formaPagamento = '';
let enderecoCompleto = { rua: "", bairro: "", cidade: "", cep: "" };
let clienteLogado = null; 

// --- FUNÇÃO: CÁLCULO DE DISTÂNCIA ---
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- IDENTIFICAÇÃO DO CLIENTE ---
window.verificarCliente = async (valor) => {
    const whatsapp = valor.replace(/\D/g, '');
    if (whatsapp.length < 10) return;

    const status = document.getElementById('statusCliente');
    if(status) status.innerText = "Buscando seu cadastro...";

    try {
        const docSnap = await getDoc(doc(db, "clientes", whatsapp));
        if (docSnap.exists()) {
            const d = docSnap.data();
            clienteLogado = d;
            if(document.getElementById('inputNome')) document.getElementById('inputNome').value = d.nome || "";
            if(document.getElementById('inputCEP')) document.getElementById('inputCEP').value = d.cep || "";
            if(document.getElementById('inputNumero')) document.getElementById('inputNumero').value = d.numero || "";
            if(status) status.innerHTML = `<span class="text-green-600 font-bold">Olá, ${d.nome}! Dados carregados.</span>`;

            if (d.cep && d.distanciaSalva) {
                distanciaCliente = d.distanciaSalva;
                recalcularTaxaEntrega();
            }
        } else {
            if(status) status.innerText = "Primeira compra? Preencha os dados abaixo:";
        }
    } catch (e) { console.error("Erro cliente:", e); }
};

// --- BUSCA DE CEP ---
window.mascaraCEP = (input) => {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    input.value = v.length > 5 ? v.substring(0, 5) + '-' + v.substring(5, 8) : v;
    if (v.length === 8) window.buscarCEP();
};

window.buscarCEP = async () => {
    const cepInput = document.getElementById('inputCEP');
    const camposEndereco = document.getElementById('camposEndereco');
    const textoEnderecoAuto = document.getElementById('textoEnderecoAuto');
    const btnProx2 = document.getElementById('btnProximo2');

    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    if (clienteLogado && clienteLogado.cep === cep && clienteLogado.distanciaSalva) {
        distanciaCliente = clienteLogado.distanciaSalva;
        recalcularTaxaEntrega();
        camposEndereco?.classList.remove('hidden');
        return;
    }

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (data.erro) return alert("CEP não encontrado");

        camposEndereco?.classList.remove('hidden');
        if(textoEnderecoAuto) textoEnderecoAuto.innerText = `${data.logradouro}, ${data.bairro}`;
        enderecoCompleto = { rua: data.logradouro, bairro: data.bairro, cidade: data.localidade, cep: cep };

        const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cep}&country=Brazil`);
        const geoData = await geo.json();

        if (geoData.length > 0 && configEntrega.coords) {
            const dist = calcularDistancia(
                parseFloat(configEntrega.coords.lat),
                parseFloat(configEntrega.coords.log || configEntrega.coords.lng),
                parseFloat(geoData[0].lat),
                parseFloat(geoData[0].lon)
            );
            
            if (configEntrega.raioMaximo > 0 && dist > configEntrega.raioMaximo) {
                alert(`Fora da área de entrega (${dist.toFixed(1)}km)`);
                if(btnProx2) btnProx2.disabled = true;
            } else {
                distanciaCliente = dist;
                recalcularTaxaEntrega();
                if(btnProx2) {
                    btnProx2.disabled = false;
                    btnProx2.classList.replace('bg-slate-200', 'bg-brand');
                }
            }
        }
    } catch (e) { console.error("Erro CEP:", e); }
};

function recalcularTaxaEntrega() {
    if (modoPedido === 'retirada') {
        taxaEntregaAtual = 0;
    } else if (configEntrega.tipo === 'km') {
        taxaEntregaAtual = parseFloat((distanciaCliente * configEntrega.valorKm).toFixed(2));
    } else {
        taxaEntregaAtual = Number(configEntrega.taxaFixa) || 0;
    }
    renderizarCarrinho();
}

// --- CARRINHO E RENDERIZAÇÃO ---
window.atualizarModoPedidoJS = (modo) => {
    modoPedido = modo;
    recalcularTaxaEntrega();
    const btn = document.getElementById('btnProximo1');
    if(btn) { btn.disabled = false; btn.classList.replace('bg-slate-200', 'bg-brand'); }
};

window.adicionarAoCarrinho = (nome, preco) => {
    if(!verificarSeEstaAberto(configHorario.abertura, configHorario.fechamento)) {
        return alert("Desculpe, estamos fechados no momento!");
    }
    carrinho.push({ nome, preco: Number(preco) });
    document.getElementById('btnCarrinho').classList.remove('hidden');
    document.getElementById('qtdItensCarrinho').innerText = carrinho.length;
};

window.abrirCarrinho = () => {
    document.getElementById('modalCarrinho').classList.remove('hidden');
    renderizarCarrinho();
};

window.fecharCarrinho = () => document.getElementById('modalCarrinho').classList.add('hidden');

function renderizarCarrinho() {
    const container = document.getElementById('listaItensCarrinho');
    if(!container) return;
    container.innerHTML = "";
    let subtotal = 0;

    carrinho.forEach(item => {
        subtotal += item.preco;
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-2xl mb-1">
                <span class="text-[11px] font-bold text-slate-700">${item.nome}</span>
                <span class="text-[11px] font-black text-brand">R$ ${item.preco.toFixed(2)}</span>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntregaAtual;
    document.getElementById('totalPasso1').innerHTML = `<div class="p-4 bg-slate-900 rounded-2xl text-white flex justify-between"><span>Total</span><b>R$ ${totalGeral.toFixed(2)}</b></div>`;
    document.getElementById('resumoFinal').innerHTML = `<div class="text-[11px] space-y-1"><div>Subtotal: R$ ${subtotal.toFixed(2)}</div><div>Frete: R$ ${taxaEntregaAtual.toFixed(2)}</div><div class="text-lg font-black border-t pt-2 mt-2">TOTAL: R$ ${totalGeral.toFixed(2)}</div></div>`;
}

// --- FINALIZAÇÃO ---
window.enviarWhatsApp = async () => {
    const pag = document.querySelector('input[name="pagamento"]:checked')?.value;
    const nome = document.getElementById('inputNome').value;
    const zapCli = document.getElementById('inputWhatsApp').value.replace(/\D/g, '');
    const num = document.getElementById('inputNumero').value;

    if(!pag || !nome || !zapCli) return alert("Preencha nome, whatsapp e pagamento!");

    await setDoc(doc(db, "clientes", zapCli), {
        nome, whatsapp: zapCli, cep: enderecoCompleto.cep, 
        rua: enderecoCompleto.rua, bairro: enderecoCompleto.bairro,
        numero: num, distanciaSalva: distanciaCliente
    }, { merge: true });

    let msg = `*NOVO PEDIDO*\n------------------\n`;
    carrinho.forEach(i => msg += `• ${i.nome}\n`);
    msg += `------------------\n*Total:* R$ ${(carrinho.reduce((a,b)=>a+b.preco,0)+taxaEntregaAtual).toFixed(2)}\n`;
    msg += `*Modo:* ${modoPedido}\n*Pagamento:* ${pag}`;
    if(modoPedido === 'entrega') msg += `\n*Endereço:* ${enderecoCompleto.rua}, ${num}`;

    window.open(`https://wa.me/${whatsappLoja.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
};

// --- INICIALIZAÇÃO DO SISTEMA ---
function verificarSeEstaAberto(abre, fecha) {
    if (!abre || !fecha) return true;
    const agora = new Date();
    const minAtual = agora.getHours() * 60 + agora.getMinutes();
    const [hA, mA] = abre.split(':').map(Number);
    const [hF, mF] = fecha.split(':').map(Number);
    const minA = hA * 60 + mA;
    const minF = hF * 60 + mF;
    return minF < minA ? (minAtual >= minA || minAtual <= minF) : (minAtual >= minA && minAtual <= minF);
}

async function inicializar() {
    if (!userId) return;
    try {
        const userSnap = await getDoc(doc(db, "usuarios", userId));
        if (userSnap.exists()) {
            const d = userSnap.data();
            
            // 1. DADOS BÁSICOS
            whatsappLoja = d.whatsapp || "";
            document.getElementById('nomeLoja').innerText = d.nomeNegocio || "Loja";
            if(document.getElementById('nomeLojaRodape')) document.getElementById('nomeLojaRodape').innerText = d.nomeNegocio || "";

            // 2. COR DO TEMA
            if (d.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', d.corTema);
            }

            // 3. HORÁRIOS E STATUS
            configHorario = { abertura: d.horarioAbertura || "", fechamento: d.horarioFechamento || "" };
            const aberto = verificarSeEstaAberto(configHorario.abertura, configHorario.fechamento);
            const dot = document.getElementById('dotStatus');
            const label = document.getElementById('labelStatus');
            if(dot && label) {
                dot.className = aberto ? "w-2 h-2 rounded-full bg-green-500 ping-aberto" : "w-2 h-2 rounded-full bg-red-500";
                label.innerText = aberto ? "Aberto Agora" : "Fechado no Momento";
            }

            // 4. CONFIG DE ENTREGA
            configEntrega = d.configEntrega || configEntrega;

            // 5. VISUAL (BANNER E LOGO)
            if (d.bannerUrl) {
                document.getElementById('bannerLoja').style.backgroundImage = `url('${d.bannerUrl}')`;
            }
            if (d.logoUrl) {
                const foto = document.getElementById('fotoLoja');
                foto.src = d.logoUrl;
                foto.classList.remove('hidden');
                document.getElementById('emojiLoja').classList.add('hidden');
            }
        }

        // 6. PRODUTOS E CATEGORIAS
        const q = query(collection(db, "produtos"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const container = document.getElementById('mainContainer');
        const nav = document.getElementById('navCategorias');
        container.innerHTML = "";
        nav.innerHTML = "";
        
        let produtosPorCat = {};
        snap.forEach(doc => {
            const p = doc.data();
            if(!produtosPorCat[p.categoria]) produtosPorCat[p.categoria] = [];
            produtosPorCat[p.categoria].push(p);
        });

        Object.keys(produtosPorCat).forEach(cat => {
            nav.innerHTML += `<a href="#cat-${cat}" class="category-tab">${cat}</a>`;
            let html = `<section id="cat-${cat}"><h2 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">${cat}</h2><div class="grid gap-3">`;
            produtosPorCat[cat].forEach(p => {
                html += `
                <div class="bg-white p-4 rounded-3xl shadow-sm flex justify-between items-center product-card transition-all" onclick="adicionarAoCarrinho('${p.nome}', ${p.preco})">
                    <div class="flex gap-4 items-center">
                        ${p.imagemUrl ? `<img src="${p.imagemUrl}" class="w-16 h-16 rounded-2xl object-cover">` : ''}
                        <div><h3 class="font-bold text-slate-800">${p.nome}</h3><p class="text-brand font-black">R$ ${Number(p.preco).toFixed(2)}</p></div>
                    </div>
                    <button class="w-10 h-10 bg-slate-50 rounded-2xl text-brand font-bold">+</button>
                </div>`;
            });
            container.innerHTML += html + `</div></section>`;
        });

    } catch (e) { console.error("Erro na inicialização:", e); }
    finally { 
        const loader = document.getElementById('loading-overlay');
        if(loader) loader.classList.add('loader-hidden'); 
    }
}

inicializar();
