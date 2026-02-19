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
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');
const selectProduto = document.getElementById('selectProduto');
const containerItens = document.getElementById('itensSelecionados');
const valorTotalPedidoTxt = document.getElementById('valorTotalPedido');

const colNovo = document.getElementById('lista-novo');
const colPreparo = document.getElementById('lista-preparo');
const colConcluido = document.getElementById('lista-concluido');

const countNovoTxt = document.getElementById('count-novo');
const countPreparoTxt = document.getElementById('count-preparo');
const countConcluidoTxt = document.getElementById('count-concluido');

// -------------------------------------------------------------------------
// ESTADO DA APLICAÇÃO
// -------------------------------------------------------------------------
let itensNoCarrinho = [];
let produtosDisponiveis = [];
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
        selectProduto.innerHTML = '<option value="">Adicionar Produto...</option>';
        
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const estoque = p.estoqueAtual || 0;
            produtosDisponiveis.push({ id: docSnap.id, ...p });
            
            const disabled = estoque <= 0 ? 'disabled' : '';
            const textoEstoque = estoque <= 0 ? '(ESGOTADO)' : `(Estoque: ${estoque})`;
            
            selectProduto.innerHTML += `
                <option value="${docSnap.id}" ${disabled}>
                    ${p.nome} - ${formatador.format(p.preco || 0)} ${textoEstoque}
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
        itensNoCarrinho.push({ 
            id: produto.id, 
            nome: produto.nome, 
            preco: parseFloat(produto.preco || 0), 
            qtd: 1 
        });
    }
    
    e.target.value = "";
    renderizarCarrinho();
};

function renderizarCarrinho() {
    containerItens.innerHTML = "";
    let total = 0;
    itensNoCarrinho.forEach((item, index) => {
        const subtotal = (item.preco || 0) * (item.qtd || 0);
        total += subtotal;
        containerItens.innerHTML += `
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-2">
                <div class="flex items-center gap-3">
                    <div class="bg-brand text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs">${item.qtd}x</div>
                    <div>
                        <p class="text-xs font-extrabold text-slate-700 uppercase">${item.nome || 'Produto'}</p>
                        <p class="text-[10px] text-slate-400 font-bold">${formatador.format(item.preco || 0)}</p>
                    </div>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-slate-300 hover:text-red-500 p-2">
                    <i data-lucide="trash-2" class="w-4 h-4 text-red-500"></i>
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
// 4. DISTRIBUIÇÃO KANBAN (MAPEAMENTO FLEXÍVEL)
// -------------------------------------------------------------------------
async function carregarPedidos() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const q = query(collection(db, "pedidos"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        colNovo.innerHTML = ""; colPreparo.innerHTML = ""; colConcluido.innerHTML = "";
        let cNovo = 0, cPreparo = 0, cConcluido = 0;

        let pedidosArray = [];
        querySnapshot.forEach(docSnap => pedidosArray.push({ id: docSnap.id, ...docSnap.data() }));
        pedidosArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        pedidosArray.forEach(p => {
            const isDelivery = p.origem === "Delivery" || p.tipo?.toLowerCase().includes("delivery");
            const corBadge = isDelivery ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600';
            const iconeBadge = isDelivery ? 'truck' : 'store';
            
            // MAPEADOR: Tenta ler de vários nomes possíveis para evitar o 0x e R$ 0,00
            const itensHtml = p.itens ? p.itens.map(i => {
                const qtd = Number(i.qtd || i.quantidade || 1); 
                const preco = Number(i.preco || i.valor || i.precoUnitario || 0);
                const nome = i.nome || i.produto || "Item";
                const subtotal = qtd * preco;

                return `
                    <div class="flex justify-between text-[11px] mb-1">
                        <span class="font-bold text-slate-600">${qtd}x ${nome}</span>
                        <span class="font-black text-slate-800">${formatador.format(subtotal)}</span>
                    </div>
                `;
            }).join('') : "";

            const totalPedido = Number(p.total || p.valorTotal || 0);

            const cardHtml = `
                <div class="card-pedido bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
                    <div class="flex justify-between items-start">
                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1 ${corBadge}">
                            <i data-lucide="${iconeBadge}" class="w-3 h-3"></i> ${isDelivery ? 'Delivery' : 'Balcão'}
                        </span>
                        <button onclick="excluirPedido('${p.id}')" class="text-slate-200 hover:text-red-500 transition-colors">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>

                    <div>
                        <h4 class="font-black text-slate-800 text-lg leading-tight">${p.cliente || 'Consumidor'}</h4>
                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">#${p.id.slice(-5).toUpperCase()} • ${p.horaEntrega || ''}</p>
                    </div>

                    <div class="bg-slate-50 rounded-2xl p-3 border border-slate-100/50">${itensHtml}</div>

                    <div class="flex justify-between items-center mt-2">
                        <p class="text-xl font-black text-brand">${formatador.format(totalPedido)}</p>
                        
                        <select onchange="atualizarStatusPedido('${p.id}', this.value)" class="bg-slate-100 text-slate-700 text-[10px] font-black rounded-xl px-3 py-2 outline-none border-none cursor-pointer">
                            <option value="Novo" ${p.status === 'Novo' ? 'selected' : ''}>🟡 Pendente</option>
                            <option value="Preparo" ${p.status === 'Preparo' ? 'selected' : ''}>🔵 Preparo</option>
                            <option value="Concluido" ${p.status === 'Concluido' ? 'selected' : ''}>🟢 Concluído</option>
                        </select>
                    </div>
                </div>`;

            if (p.status === "Novo") { colNovo.innerHTML += cardHtml; cNovo++; }
            else if (p.status === "Preparo") { colPreparo.innerHTML += cardHtml; cPreparo++; }
            else { colConcluido.innerHTML += cardHtml; cConcluido++; }
        });

        countNovoTxt.innerText = cNovo;
        countPreparoTxt.innerText = cPreparo;
        countConcluidoTxt.innerText = cConcluido;

        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("❌ Erro ao listar pedidos:", e); }
}

// -------------------------------------------------------------------------
// 5. FINALIZAR VENDA BALCÃO
// -------------------------------------------------------------------------
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return;

    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + ((Number(i.preco) || 0) * (Number(i.qtd) || 0)), 0);
    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Consumidor Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Novo",
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
        carregarPedidos();
    } catch (e) { console.error("Erro ao atualizar status:", e); }
};

window.excluirPedido = async (id) => {
    const confirm = await Swal.fire({ 
        title: 'Excluir Pedido?', 
        text: "Deseja remover este registro?",
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
    } else {
        window.location.href = "index.html";
    }
});
