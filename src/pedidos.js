import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    deleteDoc, 
    doc, 
    getDoc,
    updateDoc,
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const listaPedidos = document.getElementById('listaPedidos');
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');
const selectProduto = document.getElementById('selectProduto');
const containerItens = document.getElementById('itensSelecionados');
const valorTotalPedidoTxt = document.getElementById('valorTotalPedido');

let itensNoCarrinho = [];
let produtosDisponiveis = [];

// --- 1. PREFERÊNCIAS E NOME DINÂMICO ---
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
    } catch (e) { console.error("Erro ao carregar preferências:", e); }
}

// --- 2. CARREGAR PRODUTOS PARA O SELECT ---
async function carregarProdutosSelect(user) {
    const q = query(collection(db, "produtos"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    produtosDisponiveis = [];
    selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';
    
    snap.forEach(doc => {
        const p = doc.data();
        produtosDisponiveis.push({ id: doc.id, ...p });
        selectProduto.innerHTML += `<option value="${doc.id}">${p.nome} - R$ ${parseFloat(p.preco).toFixed(2)}</option>`;
    });
}

// --- 3. LOGICA DO CARRINHO (NOVO PEDIDO) ---
selectProduto.onchange = (e) => {
    const produtoId = e.target.value;
    if (!produtoId) return;

    const produto = produtosDisponiveis.find(p => p.id === produtoId);
    const itemExistente = itensNoCarrinho.find(item => item.id === produtoId);

    if (itemExistente) {
        itemExistente.qtd++;
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
            <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                    <p class="text-xs font-bold text-slate-700">${item.nome}</p>
                    <p class="text-[10px] text-brand font-bold">${item.qtd}x R$ ${item.preco.toFixed(2)}</p>
                </div>
                <button type="button" onclick="removerItem(${index})" class="text-red-400 hover:text-red-600">✕</button>
            </div>
        `;
    });

    valorTotalPedidoTxt.innerText = `R$ ${total.toFixed(2)}`;
}

window.removerItem = (index) => {
    itensNoCarrinho.splice(index, 1);
    renderizarCarrinho();
};

// --- 4. CARREGAR PEDIDOS (BALCÃO + ONLINE) ---
async function carregarPedidos() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            carregarPreferencias(user);
            carregarProdutosSelect(user);
            try {
                const q = query(
                    collection(db, "pedidos"), 
                    where("userId", "==", user.uid),
                    orderBy("createdAt", "desc")
                );
                const querySnapshot = await getDocs(q);
                listaPedidos.innerHTML = "";
                
                if (querySnapshot.empty) {
                    listaPedidos.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 italic">Nenhum pedido hoje.</p></div>`;
                    return;
                }

                querySnapshot.forEach(docSnap => {
                    const p = docSnap.data();
                    const id = docSnap.id;
                    const itensStr = p.itens ? p.itens.map(i => `${i.qtd}x ${i.nome}`).join(', ') : "Pedido s/ itens";
                    const badgeCor = p.origem === "Online" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600";

                    listaPedidos.innerHTML += `
                        <div class="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-50 hover:scale-[1.02] transition-all">
                            <div class="flex justify-between mb-4">
                                <span class="text-[9px] font-black uppercase px-2 py-1 rounded-lg ${badgeCor}">${p.origem || 'Balcão'}</span>
                                <button onclick="finalizarPedido('${id}')" class="text-[10px] text-green-600 font-black uppercase tracking-widest">Concluir</button>
                            </div>
                            <h4 class="font-black text-slate-800 leading-tight">${p.cliente || 'Consumidor'}</h4>
                            <p class="text-[10px] text-slate-400 font-bold mb-3 italic">"${itensStr}"</p>
                            <div class="flex justify-between items-center mt-auto pt-4 border-t border-slate-50">
                                <span class="text-lg font-black text-brand">R$ ${parseFloat(p.total).toFixed(2)}</span>
                                <span class="text-[10px] font-bold text-slate-400">${p.horaEntrega || ''}</span>
                            </div>
                        </div>
                    `;
                });
            } catch (e) { console.error(e); }
        } else { window.location.href = "index.html"; }
    });
}

// --- 5. FINALIZAR VENDA E DAR BAIXA NO ESTOQUE ---
form.onsubmit = async (e) => {
    e.preventDefault();
    if (itensNoCarrinho.length === 0) return Swal.fire("Erro", "Adicione pelo menos um produto!", "error");

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    const totalVenda = itensNoCarrinho.reduce((acc, i) => acc + (i.preco * i.qtd), 0);

    const novoPedido = {
        cliente: document.getElementById('cliente').value || "Cliente Balcão",
        itens: itensNoCarrinho,
        total: totalVenda,
        userId: auth.currentUser.uid,
        origem: "Balcão",
        status: "Concluído",
        createdAt: new Date(),
        horaEntrega: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
    };

    try {
        // 1. Salva o pedido
        await addDoc(collection(db, "pedidos"), novoPedido);

        // 2. BAIXA NO ESTOQUE (A MÁGICA ACONTECE AQUI)
        for (const item of itensNoCarrinho) {
            const produtoRef = doc(db, "produtos", item.id);
            await updateDoc(produtoRef, {
                estoqueAtual: increment(-item.qtd) // Remove a quantidade vendida
            });
        }

        Swal.fire("Sucesso!", "Venda realizada e estoque atualizado.", "success");
        modal.classList.add('hidden');
        itensNoCarrinho = [];
        form.reset();
        renderizarCarrinho();
        carregarPedidos();
    } catch (e) { console.error(e); }
    finally { btn.disabled = false; }
};

// --- 6. CONCLUIR/DELETAR ---
window.finalizarPedido = async (id) => {
    const result = await Swal.fire({
        title: 'Concluir Pedido?',
        text: "O pedido será arquivado.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, concluir'
    });

    if(result.isConfirmed) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error(e); }
    }
};

// Controle de Modal
document.getElementById('abrirModalPedido').onclick = () => modal.classList.remove('hidden');
document.getElementById('fecharModalPedido').onclick = () => modal.classList.add('hidden');
document.getElementById('btnSairDesktop')?.addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));

carregarPedidos();
