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
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const listaPedidos = document.getElementById('listaPedidos');
const modal = document.getElementById('modalPedido');
const form = document.getElementById('formPedido');

// --- 1. PREFERÊNCIAS E NOME DINÂMICO ---
async function carregarPreferencias(user) {
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeLoja = dados.nomeNegocio || "Padaria Portela";
            if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nomeLoja;
            if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nomeLoja;
            if (dados.corTema) {
                document.documentElement.style.setProperty('--cor-primaria', dados.corTema);
            }
        }
    } catch (e) { console.error("Erro ao carregar preferências:", e); }
}

// --- 2. CONTROLE DO MODAL ---
document.getElementById('abrirModalPedido').onclick = () => modal.classList.remove('hidden');
document.getElementById('fecharModalPedido').onclick = () => modal.classList.add('hidden');

// --- 3. CARREGAR PEDIDOS ---
async function carregarPedidos() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            carregarPreferencias(user);
            try {
                const q = query(
                    collection(db, "pedidos"), 
                    where("userId", "==", user.uid),
                    orderBy("dataEntrega", "asc")
                );
                const querySnapshot = await getDocs(q);
                
                listaPedidos.innerHTML = "";
                
                if (querySnapshot.empty) {
                    listaPedidos.innerHTML = `
                        <div class="col-span-full py-20 text-center">
                            <span class="text-5xl block mb-4">📭</span>
                            <p class="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhuma encomenda agendada</p>
                        </div>`;
                    return;
                }

                querySnapshot.forEach(docSnap => {
                    const p = docSnap.data();
                    const id = docSnap.id;
                    const dataFormatada = p.dataEntrega.split('-').reverse().join('/');

                    listaPedidos.innerHTML += `
                        <div class="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-gray-50 flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300">
                            <div>
                                <div class="flex justify-between items-start mb-6">
                                    <div class="bg-brand/10 p-3 rounded-2xl">
                                        <span class="text-2xl">👤</span>
                                    </div>
                                    <button onclick="finalizarPedido('${id}')" 
                                            class="text-[10px] bg-green-50 text-green-600 px-4 py-2 rounded-full font-black uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all">
                                        Concluir
                                    </button>
                                </div>
                                
                                <h4 class="font-black text-xl text-slate-800 mb-1 leading-tight">${p.cliente}</h4>
                                <div class="flex items-center gap-2 mb-6">
                                    <span class="text-xs font-black text-brand uppercase tracking-tighter bg-amber-50 px-2 py-1 rounded-md">
                                        📅 ${dataFormatada}
                                    </span>
                                    <span class="text-xs font-black text-slate-400 uppercase tracking-tighter bg-slate-50 px-2 py-1 rounded-md">
                                        ⏰ ${p.horaEntrega}
                                    </span>
                                </div>

                                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <p class="text-slate-600 text-sm font-medium leading-relaxed italic">"${p.descricao}"</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
            } catch (e) { console.error("Erro ao carregar pedidos:", e); }
        } else {
            window.location.href = "index.html";
        }
    });
}

// --- 4. SALVAR PEDIDO ---
form.onsubmit = async (e) => {
    e.preventDefault();
    const btnSalvar = form.querySelector('button[type="submit"]');
    btnSalvar.disabled = true;
    btnSalvar.innerText = "AGENDANDO...";

    const novoPedido = {
        cliente: document.getElementById('cliente').value,
        dataEntrega: document.getElementById('dataEntrega').value,
        horaEntrega: document.getElementById('horaEntrega').value,
        descricao: document.getElementById('descricao').value,
        userId: auth.currentUser.uid,
        status: "Pendente",
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "pedidos"), novoPedido);
        modal.classList.add('hidden');
        form.reset();
        carregarPedidos();
    } catch (e) { 
        console.error(e); 
        alert("Erro ao salvar encomenda.");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerText = "AGENDAR";
    }
};

// --- 5. FINALIZAR PEDIDO ---
window.finalizarPedido = async (id) => {
    if(confirm("Deseja marcar este pedido como entregue? Ele será removido da lista.")) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            carregarPedidos();
        } catch (e) { console.error("Erro ao deletar:", e); }
    }
};

// --- 6. LOGOUT (SAIR) ---
const realizarSair = async () => {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) { console.error("Erro ao sair:", error); }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', realizarSair);

// Inicia o sistema
carregarPedidos();