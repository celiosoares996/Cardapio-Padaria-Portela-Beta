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

// --- 3. CARREGAR LISTA (DESIGN DE CARDS MODERNOS) ---
async function carregarEstoque(user) {
    if (!user) return;
    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `
                <div class="p-20 text-center bg-white rounded-[3rem] border border-slate-100">
                    <i data-lucide="package-search" class="w-12 h-12 text-slate-200 mx-auto mb-4"></i>
                    <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhum insumo encontrado.</p>
                </div>`;
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
                <div class="item-card flex flex-col md:flex-row items-start md:items-center bg-white p-6 md:px-10 md:py-6 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 gap-4 md:gap-0 shadow-sm">
                    <div class="flex items-center gap-5 flex-1">
                        <div class="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                            <i data-lucide="${iconType}" class="w-6 h-6"></i>
                        </div>
                        <div>
                            <h4 class="font-extrabold text-slate-800 text-lg md:text-base">${data.nome}</h4>
                            <p class="text-[10px] font-black text-slate-300 uppercase tracking-widest md:hidden mt-1">Saldo Atual</p>
                        </div>
                    </div>

                    <div class="w-full md:w-48 flex items-baseline justify-start md:justify-center gap-1">
                        <span class="text-3xl md:text-xl font-black text-brand">${data.quantidade}</span>
                        <span class="text-xs font-bold text-slate-400 uppercase">${data.unidade}</span>
                    </div>

                    <div class="w-full md:w-32 flex justify-end items-center gap-2 border-t md:border-none pt-4 md:pt-0">
                        <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" 
                                class="flex-1 md:flex-none flex items-center justify-center gap-2 md:p-3 py-3 text-slate-400 hover:text-brand hover:bg-blue-50 rounded-xl transition-all">
                            <i data-lucide="pencil" class="w-4 h-4"></i>
                            <span class="md:hidden text-xs font-bold uppercase">Editar</span>
                        </button>
                        <button onclick="deletarItem('${id}')" 
                                class="flex-1 md:flex-none flex items-center justify-center gap-2 md:p-3 py-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            <span class="md:hidden text-xs font-bold uppercase">Excluir</span>
                        </button>
                    </div>
                </div>
            `;
        });
        if(window.lucide) lucide.createIcons();
    } catch (e) { 
        console.error("Erro ao carregar:", e); 
        Swal.fire('Erro', 'Não foi possível carregar o estoque.', 'error');
    }
}

// --- 4. SALVAR/ATUALIZAR COM SWEETALERT ---
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

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
            await updateDoc(doc(db, "estoque", id), dados);
            Swal.fire({
                icon: 'success',
                title: 'Atualizado!',
                text: 'Dados salvos com sucesso.',
                confirmButtonColor: '#2563eb',
                customClass: { popup: 'rounded-[2rem]' }
            });
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
            Swal.fire({
                icon: 'success',
                title: 'Cadastrado!',
                text: 'Item adicionado ao estoque.',
                confirmButtonColor: '#2563eb',
                customClass: { popup: 'rounded-[2rem]' }
            });
        }
        form.reset();
        modal.classList.add('hidden');
        await carregarEstoque(user);
    } catch (error) {
        console.error("ERRO FIREBASE:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro de Permissão',
            text: 'Verifique as regras do Firebase ou se o item pertence a você.',
            confirmButtonColor: '#ef4444'
        });
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        if(window.lucide) lucide.createIcons();
    }
});

// --- 5. GLOBAIS ---
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
                Swal.fire({
                    title: 'Excluído!',
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
            } catch (error) {
                Swal.fire('Erro!', 'Não foi possível remover o item.', 'error');
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

document.getElementById('btnSairDesktop')?.addEventListener('click', async () => {
    Swal.fire({
        title: 'Sair do sistema?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sair',
        cancelButtonText: 'Ficar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await signOut(auth);
            window.location.href = "index.html";
        }
    });
});
