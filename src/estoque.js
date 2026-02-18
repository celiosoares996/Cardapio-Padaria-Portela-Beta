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
    serverTimestamp 
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
    } catch (error) {
        console.error("Erro ao carregar preferências:", error);
    }
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

if (btnFechar) {
    btnFechar.onclick = () => modal.classList.add('hidden');
}

// --- 3. CARREGAR LISTA DE INSUMOS ---
async function carregarEstoque(user) {
    if (!user) return;
    
    try {
        // Importante: Verifique se existe um índice para userId no console do Firebase se o erro persistir
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `
                <tr>
                    <td colspan="3" class="p-20 text-center">
                        <i data-lucide="package-search" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                        <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhum insumo no estoque.</p>
                    </td>
                </tr>`;
            if(window.lucide) lucide.createIcons();
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            let iconType = 'package';
            if(['kg', 'gr'].includes(data.unidade)) iconType = 'wheat';
            if(['lt', 'ml'].includes(data.unidade)) iconType = 'droplets';

            lista.innerHTML += `
                <tr class="flex flex-col md:table-row p-4 md:p-0 bg-white mb-3 md:mb-0 rounded-2xl md:rounded-none border border-slate-100 md:border-b transition-hover hover:bg-slate-50/50">
                    <td class="md:p-6">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                <i data-lucide="${iconType}" class="w-5 h-5"></i>
                            </div>
                            <span class="font-bold text-slate-700">${data.nome}</span>
                        </div>
                    </td>
                    <td class="md:p-6 flex justify-between md:table-cell items-center">
                        <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase">Qtd Atual</span>
                        <span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-black italic">
                            ${data.quantidade} <small class="not-italic opacity-60 uppercase text-[9px]">${data.unidade}</small>
                        </span>
                    </td>
                    <td class="md:p-6 flex justify-end gap-2">
                        <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="p-2 text-slate-300 hover:text-brand transition-colors">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                        </button>
                        <button onclick="deletarItem('${id}')" 
                                class="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        if(window.lucide) lucide.createIcons();
    } catch (e) { 
        console.error("Erro detalhado do Firestore:", e);
        lista.innerHTML = `<tr><td colspan="3" class="p-10 text-center text-red-400 text-xs font-bold uppercase">Erro ao carregar dados. Verifique o console.</td></tr>`;
    }
}

// --- 4. SALVAR OU ATUALIZAR INSUMO ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    
    if (!user) {
        alert("Sessão expirada. Faça login novamente.");
        return;
    }

    const btn = form.querySelector('button[type="submit"]');
    const id = editIdInput.value;
    
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerText = "Sincronizando...";

    const dados = {
        nome: document.getElementById('nomeItem').value.trim(),
        quantidade: parseInt(document.getElementById('quantidadeItem').value) || 0, 
        unidade: document.getElementById('unidadeItem').value,
        userId: user.uid,
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        if (id) {
            const docRef = doc(db, "estoque", id);
            await updateDoc(docRef, dados);
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
        }
        
        form.reset();
        modal.classList.add('hidden');
        await carregarEstoque(user);
    } catch (error) {
        console.error("Erro ao salvar no Firestore:", error);
        // Se o erro persistir, verifique se as Regras permitem escrita na coleção 'estoque'
        alert("Erro ao salvar! Verifique se você publicou as regras no console do Firebase.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        if(window.lucide) lucide.createIcons();
    }
});

// --- 5. FUNÇÕES GLOBAIS ---
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
    if(confirm("Deseja remover este insumo?")) {
        try {
            await deleteDoc(doc(db, "estoque", id));
            await carregarEstoque(auth.currentUser);
        } catch (error) {
            console.error("Erro ao deletar:", error);
            alert("Erro ao excluir.");
        }
    }
};

// --- 6. AUTH MONITOR ---
onAuthStateChanged(auth, (user) => {
    if (user) { 
        carregarPreferencias(user); 
        carregarEstoque(user); 
    } else { 
        window.location.href = "index.html"; 
    }
});

document.getElementById('btnSairDesktop')?.addEventListener('click', async () => {
    if (confirm("Deseja sair?")) {
        await signOut(auth);
        window.location.href = "index.html";
    }
});
