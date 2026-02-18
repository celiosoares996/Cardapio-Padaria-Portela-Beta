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

// --- 1. TEMA E NOME ---
async function carregarPreferencias(user) {
    const docRef = doc(db, "usuarios", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const dados = docSnap.data();
        if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = dados.nomeNegocio || "Estoque";
        if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = dados.nomeNegocio || "Estoque";
        document.documentElement.style.setProperty('--cor-primaria', dados.corTema || "#2563eb");
    }
}

// --- 2. CONTROLE DO MODAL ---
btnAbrir.onclick = () => {
    form.reset();
    editIdInput.value = ""; 
    modalTitulo.innerText = "Novo Insumo";
    modal.classList.remove('hidden');
    if(window.lucide) lucide.createIcons();
};

btnFechar.onclick = () => modal.classList.add('hidden');

// --- 3. CARREGAR INSUMOS ---
async function carregarEstoque(user) {
    if (!user) return;
    try {
        const q = query(collection(db, "estoque"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 

        if (querySnapshot.empty) {
            lista.innerHTML = `<tr><td colspan="3" class="p-10 text-center text-slate-400">Nenhum insumo cadastrado.</td></tr>`;
            return;
        }

        querySnapshot.forEach((documento) => {
            const data = documento.data();
            const id = documento.id;
            
            // Lógica de ícone por unidade de medida de insumo
            let iconType = 'package';
            if(['kg', 'gr'].includes(data.unidade)) iconType = 'wheat'; // Insumos secos/farinhas
            if(['lt', 'ml'].includes(data.unidade)) iconType = 'droplets'; // Insumos líquidos

            lista.innerHTML += `
                <tr class="flex flex-col md:table-row p-4 md:p-0 bg-white mb-3 md:mb-0 rounded-2xl md:rounded-none border border-slate-100 md:border-b">
                    <td class="md:p-6">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                <i data-lucide="${iconType}" class="w-5 h-5"></i>
                            </div>
                            <span class="font-bold text-slate-700">${data.nome}</span>
                        </div>
                    </td>
                    <td class="md:p-6 flex justify-between md:table-cell items-center">
                        <span class="md:hidden text-[10px] font-bold text-slate-400 uppercase">Qtd Insumo</span>
                        <span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-black italic">
                            ${data.quantidade} <small class="not-italic opacity-60">${data.unidade}</small>
                        </span>
                    </td>
                    <td class="md:p-6 flex justify-end gap-2">
                        <button onclick="prepararEdicao('${id}', '${data.nome}', ${data.quantidade}, '${data.unidade}')" class="p-2 text-slate-400 hover:text-blue-600"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                        <button onclick="deletarItem('${id}')" class="p-2 text-slate-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </td>
                </tr>
            `;
        });
        if(window.lucide) lucide.createIcons();
    } catch (e) { console.error(e); }
}

// --- 4. SALVAR/ATUALIZAR (CORREÇÃO DO ERRO) ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const btn = form.querySelector('button[type="submit"]');
    const id = editIdInput.value;
    
    // Evitar cliques duplos e erro de interface
    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerText = "Processando...";

    const dados = {
        nome: document.getElementById('nomeItem').value.trim(),
        quantidade: Number(document.getElementById('quantidadeItem').value), // Conversão explícita para número
        unidade: document.getElementById('unidadeItem').value,
        userId: user.uid,
        ultimaAtualizacao: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "estoque", id), dados);
        } else {
            dados.dataCriacao = serverTimestamp();
            await addDoc(collection(db, "estoque"), dados);
        }
        form.reset();
        modal.classList.add('hidden');
        carregarEstoque(user);
    } catch (error) {
        console.error("Erro ao salvar insumo:", error);
        alert("Erro ao salvar! Verifique os campos.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
        if(window.lucide) lucide.createIcons();
    }
});

// Funções Globais (Edit/Delete) permanecem as mesmas, garantindo o carregarEstoque(user) no final.
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
    if(confirm("Remover este insumo?")) {
        await deleteDoc(doc(db, "estoque", id));
        carregarEstoque(auth.currentUser);
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) { carregarPreferencias(user); carregarEstoque(user); }
    else { window.location.href = "index.html"; }
});
