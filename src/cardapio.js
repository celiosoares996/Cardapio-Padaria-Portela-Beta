import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Pegar ID da loja via URL
const params = new URLSearchParams(window.location.search);
const userId = params.get('id') || "SEU_ID_PADRAO_AQUI"; // ID para teste se não houver na URL

// Estados Globais
let carrinho = [];
let lojaConfig = {};
let modoPedido = 'entrega';
let taxaEntrega = 0;

// --- INICIALIZAÇÃO ---
async function carregarLoja() {
    if (!userId) return;
    try {
        const snap = await getDoc(doc(db, "usuarios", userId));
        if (snap.exists()) {
            lojaConfig = snap.data();
            document.getElementById('nomeLoja').innerText = lojaConfig.nomeNegocio || "Loja";
            if(lojaConfig.fotoCapa) document.getElementById('bannerLoja').style.backgroundImage = `url('${lojaConfig.fotoCapa}')`;
            if(lojaConfig.fotoPerfil) {
                document.getElementById('logoLoja').src = lojaConfig.fotoPerfil;
                document.getElementById('logoLoja').classList.remove('hidden');
                document.getElementById('emojiLoja').classList.add('hidden');
            }
            // Status Aberto/Fechado (Lógica simplificada)
            const dot = document.getElementById('dotStatus');
            dot.className = "w-2 h-2 rounded-full bg-green-500 ping-aberto";
            document.getElementById('labelStatus').innerText = "Aberto Agora";
        }
        await carregarProdutos();
    } catch (e) { console.error("Erro ao carregar loja:", e); }
}

async function carregarProdutos() {
    const q = query(collection(db, "produtos"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const container = document.getElementById('mainContainer');
    const nav = document.getElementById('navCategorias');
    
    const categorias = {};

    querySnapshot.forEach((doc) => {
        const p = doc.data();
        if (!categorias[p.categoria]) categorias[p.categoria] = [];
        categorias[p.categoria].push({ id: doc.id, ...p });
    });

    Object.keys(categorias).forEach(cat => {
        // Nav Tab
        nav.innerHTML += `<button onclick="document.getElementById('${cat}').scrollIntoView({behavior:'smooth'})" class="category-tab">${cat}</button>`;
        
        // Seção
        let sectionHTML = `<h2 id="${cat}" class="px-4 mt-8 mb-4 text-[10px] font-black opacity-30 tracking-[0.2em] uppercase">${cat}</h2>`;
        categorias[cat].forEach(p => {
            sectionHTML += `
                <div class="product-card active:scale-[0.98] transition-all" onclick="window.addCarrinho('${p.nome}', ${p.preco})">
                    <div class="product-info">
                        <h3 class="font-bold text-sm text-white">${p.nome}</h3>
                        <p class="text-[10px] text-slate-500 mt-1 line-clamp-2">${p.descricao || ''}</p>
                        <p class="mt-3 font-black text-[var(--cor-primaria)]">R$ ${p.preco.toFixed(2).replace('.',',')}</p>
                    </div>
                    <img src="${p.foto}" class="product-img bg-slate-800" onerror="this.src='https://via.placeholder.com/100'">
                </div>`;
        });
        container.innerHTML += sectionHTML;
    });
    document.getElementById('loading-overlay').classList.add('loader-hidden');
}

// --- LÓGICA DO CARRINHO ---
window.addCarrinho = (nome, preco) => {
    carrinho.push({ nome, preco });
    window.renderizarCarrinho();
    document.getElementById('btnCarrinho').classList.remove('hidden');
};

window.renderizarCarrinho = () => {
    const lista = document.getElementById('listaItensCarrinho');
    const totalBotao = document.getElementById('valorTotalCarrinho');
    const badge = document.getElementById('qtdItensCarrinho');
    
    let subtotal = 0;
    lista.innerHTML = "";

    carrinho.forEach((item, index) => {
        subtotal += item.preco;
        lista.innerHTML += `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                <div>
                    <p class="font-bold">${item.nome}</p>
                    <p class="text-[10px] text-[var(--cor-primaria)]">R$ ${item.preco.toFixed(2)}</p>
                </div>
                <button onclick="window.removerItem(${index})" class="text-red-500 text-[10px] font-black">REMOVER</button>
            </div>`;
    });

    const totalGeral = subtotal + taxaEntrega;
    totalBotao.innerText = `R$ ${totalGeral.toFixed(2).replace('.',',')}`;
    badge.innerText = carrinho.length;

    // Resumos nos passos
    const resumoHTML = `
        <div class="flex justify-between text-xs opacity-60"><span>Subtotal</span><span>R$ ${subtotal.toFixed(2)}</span></div>
        <div class="flex justify-between text-xs opacity-60"><span>Frete</span><span>${taxaEntrega > 0 ? 'R$ '+taxaEntrega.toFixed(2) : 'Grátis'}</span></div>
        <div class="flex justify-between text-lg font-black mt-2 pt-2 border-t border-white/10"><span>TOTAL</span><span class="text-[var(--cor-primaria)]">R$ ${totalGeral.toFixed(2)}</span></div>
    `;
    document.getElementById('totalPasso1').innerHTML = resumoHTML;
    document.getElementById('resumoFinal').innerHTML = resumoHTML;
};

window.removerItem = (i) => {
    carrinho.splice(i, 1);
    if(carrinho.length === 0) document.getElementById('btnCarrinho').classList.add('hidden');
    window.renderizarCarrinho();
};

// --- FRETE E ENDEREÇO ---
window.mascaraCEP = (i) => {
    i.value = i.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2");
    if(i.value.length === 9) window.buscarCEP(i.value);
};

window.buscarCEP = async (cep) => {
    const status = document.getElementById('statusCEP');
    status.innerText = "Buscando...";
    try {
        const r = await fetch(`https://viacep.com.br/ws/${cep.replace('-','')}/json/`);
        const d = await r.json();
        if(d.erro) throw new Error();
        
        document.getElementById('camposEndereco').classList.remove('hidden');
        document.getElementById('textoEnderecoAuto').innerText = `${d.logradouro}, ${d.bairro} - ${d.localidade}/${d.uf}`;
        
        // Exemplo: Taxa fixa se o CEP for válido. 
        // Aqui você pode colocar sua lógica de KM se tiver as coordenadas no Firebase.
        taxaEntrega = parseFloat(lojaConfig.configEntrega?.taxaFixa || 5.00);
        window.renderizarCarrinho();
        status.innerText = "CEP Localizado!";
    } catch {
        status.innerText = "CEP não encontrado.";
    }
};

window.atualizarModoPedidoJS = (m) => {
    modoPedido = m;
    taxaEntrega = (m === 'retirada') ? 0 : parseFloat(lojaConfig.configEntrega?.taxaFixa || 5.00);
    window.renderizarCarrinho();
};

window.getModoPedido = () => modoPedido;

// --- FINALIZAÇÃO ---
window.enviarWhatsApp = async () => {
    const nome = document.getElementById('inputNome').value;
    const whats = document.getElementById('inputWhatsApp').value;
    const pagamentos = document.getElementsByName('pagamento');
    let formaPag = "";
    pagamentos.forEach(p => { if(p.checked) formaPag = p.value; });

    if(!formaPag) { alert("Escolha o pagamento!"); return; }

    const subtotal = carrinho.reduce((a, b) => a + b.preco, 0);
    const total = subtotal + taxaEntrega;
    const endereco = modoPedido === 'entrega' 
        ? `${document.getElementById('textoEnderecoAuto').innerText}, Nº ${document.getElementById('inputNumero').value}`
        : "Retirada na Loja";

    // Criar Objeto do Pedido para o Firebase
    const pedido = {
        userId,
        cliente: nome,
        whatsapp: whats,
        itens: carrinho,
        total,
        pagamento: formaPag,
        endereco,
        status: "Pendente",
        data: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "pedidos"), pedido);
        
        // Montar link WhatsApp
        let texto = `*NOVO PEDIDO* 🛒\n\n*Cliente:* ${nome}\n*WhatsApp:* ${whats}\n\n`;
        carrinho.forEach(i => texto += `• ${i.nome} (R$ ${i.preco.toFixed(2)})\n`);
        texto += `\n*Entrega:* ${modoPedido === 'entrega' ? '🛵' : '🛍️'}\n*Endereço:* ${endereco}`;
        texto += `\n*Pagamento:* ${formaPag}\n*TOTAL:* R$ ${total.toFixed(2)}`;

        const foneLoja = lojaConfig.whatsapp.replace(/\D/g, '');
        window.location.href = `https://wa.me/55${foneLoja}?text=${encodeURIComponent(texto)}`;
    } catch (e) {
        alert("Erro ao salvar pedido.");
    }
};

carregarLoja();
