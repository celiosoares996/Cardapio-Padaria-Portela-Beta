import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc, 
    doc, 
    getDoc,
    updateDoc,
    increment,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// -------------------------------------------------------------------------
// ELEMENTOS DO DOM
// -------------------------------------------------------------------------
const listaPedidos = document.getElementById('listaPedidos');
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');
const selectProduto = document.getElementById('selectProduto');
const containerItens = document.getElementById('itensSelecionados');
const valorTotalPedidoTxt = document.getElementById('valorTotalPedido');

// -------------------------------------------------------------------------
// ESTADO DA APLICAÇÃO
// -------------------------------------------------------------------------
let itensNoCarrinho = [];
let produtosDisponiveis = [];
let filtroStatus = "todos"; // 'todos', 'novo', 'preparo', 'concluido'
const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// -------------------------------------------------------------------------
// 1. PREFERÊNCIAS E TEMA
// -------------------------------------------------------------------------
async function carregarPreferencias(user) {
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeLoja = dados.nomeNegocio || "Meu Negócio";
            document.querySelectorAll('#navNomeNegocio, #sideNomeNegocio').forEach(el => el.innerText = nomeLoja);
            if (dados.corTema) document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
        }
    } catch (e) { console.error("📋 Erro ao carregar preferências:", e); }
}

// -------------------------------------------------------------------------
// 2. CARREGAR PRODUTOS (SELECT)
// -------------------------------------------------------------------------
async function carregarProdutosSelect(user) {
    try {
        const q = query(collection(db, "produtos"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        produtosDisponiveis = [];
        selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';
        
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const estoque = p.estoqueAtual || 0;
            produtosDisponiveis.push({ id: docSnap.id, ...p });
            
            const disabled = estoque <= 0 ? 'disabled' : '';
            const textoEstoque = estoque <= 0 ? '(ESGOTADO)' : `(Estoque: ${estoque})`;
            
            selectProduto.innerHTML += `
                <option value="${docSnap.id}" ${disabled}>
                    ${p.nome} - ${formatador.format(p.preco)} ${textoEstoque}
                </option>`;
        });
    } catch (e) { console.error("📦 Erro ao carregar produtos:", e); }
}

// -------------------------------------------------------------------------
// 3. LÓGICA DO CARRINHO (VENDA BALCÃO)
// -------------------------------------------------------------------------
selectProduto.onchange = (e) => {
    const produtoId = e.target.value;
    if (!produtoId) return;

    const produto = produtosDisponiveis.find(p => p.id === produtoId);
    const itemNoCarrinho = itensNoCarrinho.find(item => item.id === produtoId);
    const qtdAtualNoCarrinho = itemNoCarrinho ? itemNoCarrinho.qtd : 0;

    if (produto.estoqueAtual <= qtdAtualNoCarrinho) {
        Swal.fire("Atenção", `Estoque insuficiente para ${produto.nome}.`, "warning");
        e.target.value = "";
        return;
    }

    if (itemNoCarrinho) {
        itemNoCarrinho.qtd++;
    } else {
        itensNoCarrinho.push({ id: produto.id, nome: produto.nome, preco: parseFloat(produto.preco), qtd: 1 });
    }
    
    e.target.value = "";
    renderizarCarrinho();
};

function renderizarCarrinho() {
    containerItens.innerHTML = "";
    let total = 0;
    itensNoCarrinho.forEach((item, index) => {
        total += item.preco * item.qtd;
        containerItens.innerHTML += `
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-2">
                <div class="flex items-center gap-3">
                    <div class="bg-brand text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">${item.qtd}x</div>
                    <div>
                        <p class="text-xs font-extrabold text-slate-700 uppercase">${item.nome}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${formatador.format(item.preco)}</p>
                    </div>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-slate-300 hover:text-red-500 p-2">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>`;
    });
    valorTotalPedidoTxt.innerText = formatador.format(total);
    if (window.lucide) lucide.createIcons();
}

window.removerItem = (index) => {
    itensNoCarrinho.splice(index, 1);
    renderizarCarrinho();
};

// -------------------------------------------------------------------------
// 4. RENDERIZAR PEDIDOS (DELIVERY VS BALCÃO)
// -------------------------------------------------------------------------
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    listaPedidos.innerHTML = `<div class="col-span-full py-20 text-center animate-pulse"><p class="text-slate-400 font-bold">Sincronizando...</p></div>`;

    try {
        const q = query(collection(db, "pedidos"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        let pedidosArray = [];
        
        querySnapshot.forEach(docSnap => {
            pedidosArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        pedidosArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        // Filtro de Status
        if (filtroStatus !== "todos") {
            pedidosArray = pedidosArray.filter(p => p.status.toLowerCase() === filtroStatus.toLowerCase());
        }

        listaPedidos.innerHTML = "";

        if (pedidosArray.length === 0) {
            listaPedidos.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 font-medium italic">Nenhum pedido encontrado.</p></div>`;
            return;
        }

        pedidosArray.forEach(p => {
            const isDelivery = p.origem === "Delivery" || p.tipo === "🛵 Delivery (entrega)";
            const corBadge = isDelivery ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600';
            const iconeBadge = isDelivery ? 'truck' : 'store';
            
            // Itens com quantidade e valor
            const itensHtml = p.itens ? p.itens.map(i => `
                <div class="flex justify-between text-sm mb-1">
                    <span class="font-bold text-slate-600">${i.qtd}x <span class="font-medium">${i.nome}</span></span>
                    <span class="font-black text-slate-800">${formatador.format(i.preco * i.qtd)}</span>
                </div>
            `).join('') : "";

            listaPedidos.innerHTML += `
                <div class="card-pedido bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100 flex flex-col gap-4">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col gap-1">
                            <span class="status-badge ${corBadge}">
                                <i data-lucide="${iconeBadge}" class="w-3 h-3"></i> ${isDelivery ? 'Delivery' : 'Balcão'}
                            </span>
                            <span class="text-[10px] font-bold text-slate-400">#${p.id.slice(-5).toUpperCase()} • ${p.horaEntrega || ''}</span>
                        </div>
                        <button onclick="excluirPedido('${p.id}')" class="text-slate-200 hover:text-red-500 transition-colors">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>

                    <div>
                        <h3 class="text-xl font-black text-slate-800 tracking-tight leading-none">${p.cliente || 'Consumidor'}</h3>
                        ${p.telefone ? `<a href="https://wa.me/55${p.telefone.replace(/\D/g,'')}" class="text-xs font-bold text-green-500 flex items-center gap-1 mt-1"><i data-lucide="message-circle" class="w-3 h-3"></i> WhatsApp</a>` : ''}
                    </div>

                    <div class="bg-slate-50 rounded-2xl p-4 space-y-1">${itensHtml}</div>

                    ${p.observacoes ? `
                        <div class="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-xl">
                            <p class="text-[10px] font-black text-amber-600 uppercase">Observação:</p>
                            <p class="text-xs font-bold text-amber-800 italic">"${p.observacoes}"</p>
                        </div>` : ''}

                    ${isDelivery && p.endereco ? `
                        <div class="flex items-center gap-3 p-3 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                            <i data-lucide="map-pin" class="w-4 h-4 text-blue-600 shrink-0"></i>
                            <p class="text-xs font-bold text-slate-600 truncate">${p.endereco}</p>
                        </div>` : ''}

                    <div class="flex justify-between items-end mt-auto pt-2">
                        <div>
                            <p class="text-[10px] font-black text-slate-400 uppercase">Total</p>
                            <p class="text-2xl font-black text-brand">${formatador.format(p.total)}</p>
                        </div>
                        <select onchange="atualizarStatusPedido('${p.id}', this.value)" class="bg-slate-100 text-slate-700 text-[10px] font-black rounded-lg p-2 outline-none border-none">
                            <option value="Novo" ${p.status === 'Novo' ? 'selected' : ''}>🟡 Novo</option>
                            <option value="Preparo" ${p.status === 'Preparo' ? 'selected' : ''}>🔵 Preparo</option>
                            <option value="Concluido" ${p.status === 'Concluido' ? 'selected' : ''}>🟢 Concluído</option>
                        </select>
                    </div>
                </div>`;
        });
        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("❌ Erro ao listar pedidos:", e); }
}

// -------------------------------------------------------------------------
// 5. LÓGICA DE FILTROS (CORRIGIDA)
// -------------------------------------------------------------------------
function configurarFiltros() {
    const botoes = document.querySelectorAll('[data-filter]');
    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            filtroStatus = btn.getAttribute('data-filter');
            
            // Reset visual
            botoes.forEach(b => {
                b.className = "filter-btn px-8 py-3 bg-white text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all whitespace-nowrap";
            });

            // Ativa selecionado
            btn.className = "filter-btn px-8 py-3 bg-brand text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 whitespace-nowrap";
            
            carregarPedidos();
        });
    });
}

// -------------------------------------------------------------------------
// 6. FINALIZAR VENDA BALCÃO
// -------------------------------------------------------------------------
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + (i.preco * i.qtd), 0);
    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Consumidor Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Concluido", // Gravamos sem acento para facilitar o filtro
        createdAt: serverTimestamp(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
    };

    try {
        await addDoc(collection(db, "pedidos"), novoPedido);
        for (const item of itensNoCarrinho) {
            await updateDoc(doc(db, "produtos", item.id), { estoqueAtual: increment(-item.qtd) });
        }
        fecharModal();
        carregarPedidos();
        carregarProdutosSelect(auth.currentUser);
        Swal.fire({ icon: 'success', title: 'Venda Realizada!', timer: 1500, showConfirmButton: false });
    } catch (e) { 
        console.error(e);
        Swal.fire("Erro", "Falha ao registrar venda.", "error");
    } finally { btnSubmit.disabled = false; }
};

// -------------------------------------------------------------------------
// AÇÕES DE ATUALIZAÇÃO
// -------------------------------------------------------------------------
window.atualizarStatusPedido = async (id, novoStatus) => {
    try {
        await updateDoc(doc(db, "pedidos", id), { status: novoStatus });
        // Se for para concluído, podemos recarregar a lista para respeitar o filtro
        if(filtroStatus !== 'todos') carregarPedidos();
    } catch (e) { console.error("Erro ao atualizar status:", e); }
};

window.excluirPedido = async (id) => {
    const confirm = await Swal.fire({ 
        title: 'Excluir Pedido?', 
        text: "O estoque não será devolvido automaticamente.",
        icon: 'warning',
        showCancelButton: true, 
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, excluir'
    });

    if(confirm.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

function fecharModal() {
    modal.classList.add('hidden');
    itensNoCarrinho = [];
    form.reset();
    renderizarCarrinho();
}

document.getElementById('abrirModalPedido').onclick = () => modal.classList.remove('hidden');
document.getElementById('fecharModalPedido').onclick = fecharModal;
document.getElementById('btnSairDesktop')?.addEventListener('click', () => signOut(auth));

// -------------------------------------------------------------------------
// INICIALIZAÇÃO
// -------------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarPreferencias(user);
        carregarProdutosSelect(user);
        carregarPedidos();
        configurarFiltros(); 
    } else {
        window.location.href = "index.html";
    }
});
