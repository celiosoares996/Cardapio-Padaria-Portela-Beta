import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, getDocs, query, where, deleteDoc, doc, getDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const form = document.getElementById('formEstoque');
const lista = document.getElementById('listaEstoque');
const modal = document.getElementById('modal');
const btnAbrir = document.getElementById('abrirModal');
const btnFechar = document.getElementById('fecharModal');
const modalTitulo = document.getElementById('modalTitulo');
const editIdInput = document.getElementById('editId');

// --- 1. TEMA E NOME DO NEGÓCIO ---
async function carregarPreferencias(user) {
    if (!user) return;
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeNegocio = dados.nomeNegocio || "Estoque";
            if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nomeNegocio;
            if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nomeNegocio;
            document.documentElement.style.setProperty('--cor-primaria', dados.corTema || "#2563eb");
        }
    } catch (error) { console.error("Erro preferências:", error); }
}

// --- 2. CONTROLE DO MODAL ---
if (btnAbrir) {
    btnAbrir.onclick = () => {
        form.reset();
        editIdInput.value = ""; 
        modalTitulo.innerText = "Novo Insumo";
        modal.classList.remove('hidden');
        if(window.lucide) lucide.createIcons();
    };
}
if (btnFechar) btnFechar.onclick = () => modal.classList.add('hidden');

// --- 3. CARREGAR LISTA (DESIGN ALINHADO COM GRID) ---
async function carregarEstoque(user) {
    if (!user) return;
    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `
                <div class="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Estoque vazio.</p>
                </div>`;
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            let iconType = 'package';
            if(['kg', 'gr'].includes(data.unidade)) iconType = 'wheat';
            if(['lt', 'ml'].includes(data.unidade)) iconType = 'droplets';

            // Estrutura em GRID para garantir o alinhamento vertical das colunas no Desktop
            lista.innerHTML += `
                <div class="grid grid-cols-1 md:grid-cols-[1fr_200px_120px] items-center bg-white p-5 md:px-8 md:py-4 rounded-2xl md:rounded-3xl border border-slate-100 hover:border-blue-200 transition-all gap-4 md:gap-0 shadow-sm">
                    
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                            <i data-lucide="${iconType}" class="w-5 h-5"></i>
                        </div>
                        <span class="font-bold text-slate-700 text-lg md:text-base">${data.nome}</span>
                    </div>

                    <div class="flex flex-col md:items-center">
                        <span class="md:hidden text-[10px] font-black text-slate-300 uppercase mb-1">Saldo Atual</span>
                        <div class="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-black italic w-fit md:w-auto md:min-w-[100px] text-center">
                            ${data.quantidade} <small class="not-italic opacity-60 uppercase text-[9px]">${data.unidade}</small>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 border-t md:border-none pt-3 md:pt-0">
                        <button onclick="window.prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="p-3 md:p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                            <i data-lucide="pencil" class="w-5 h-5 md:w-4 md:h-4"></i>
                        </button>
                        <button onclick="window.deletarItem('${id}')" 
                                class="p-3 md:p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <i data-lucide="trash-2" class="w-5 h-5 md:w-4 md:h-4"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        if(window.lucide) lucide.createIcons();
    } catch (e) { 
        console.error("Erro ao carregar:", e); 
    }
}

// --- 4. SALVAR/ATUALIZAR ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const id = editIdInput.value;
    const dados = {
        nome: document.getElementById('nomeItem').value.trim(),
        quantidade: parseInt(document.getElementById('quantidadeItem').value) || 0,
        unidade: document.getElementById('unidadeItem').value,
        userId: user.uid,
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "estoque", id), dados);
            Swal.fire({ icon: 'success', title: 'Atualizado!', confirmButtonColor: '#2563eb', customClass: { popup: 'rounded-[2rem]' } });
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
            Swal.fire({ icon: 'success', title: 'Cadastrado!', confirmButtonColor: '#2563eb', customClass: { popup: 'rounded-[2rem]' } });
        }
        form.reset();
        modal.classList.add('hidden');
        await carregarEstoque(user);
    } catch (error) {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Erro ao salvar', confirmButtonColor: '#ef4444' });
    }
});

// --- 5. FUNÇÕES GLOBAIS (Obrigatório 'window.' para módulos) ---
window.prepararEdicao = (id, nome, qtd, unid) => {
    editIdInput.value = id;
    document.getElementById('nomeItem').value = nome;
    document.getElementById('quantidadeItem').value = qtd;
    document.getElementById('unidadeItem').value = unid;
    modalTitulo.innerText = "Atualizar Insumo";
    modal.classList.remove('hidden');
    if(window.lucide) lucide.createIcons();
};

window.deletarItem = async (id) => {
    Swal.fire({
        title: 'Remover insumo?',
        text: "Esta ação não pode ser desfeita!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sim, remover!',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        customClass: { popup: 'rounded-[2rem]' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "estoque", id));
                await carregarEstoque(auth.currentUser);
                Swal.fire({ title: 'Excluído!', icon: 'success', confirmButtonColor: '#2563eb' });
            } catch (error) {
                Swal.fire('Erro!', 'Não foi possível remover.', 'error');
            }
        }
    });
};

// --- 6. AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) { 
        carregarPreferencias(user); 
        carregarEstoque(user); 
    } else { 
        window.location.href = "index.html"; 
    }
});

// Logout Sidebar
document.getElementById('btnSairDesktop')?.addEventListener('click', async () => {
    const res = await Swal.fire({
        title: 'Sair do sistema?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Sair',
        cancelButtonText: 'Ficar'
    });
    if (res.isConfirmed) {
        await signOut(auth);
        window.location.href = "index.html";
    }
});
