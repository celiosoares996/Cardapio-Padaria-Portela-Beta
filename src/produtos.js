import { db, auth, storage } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc, 
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- REFERÊNCIAS DO DOM ---
const formProduto = document.getElementById('formProduto');
const inputFoto = document.getElementById('fotoProduto');
const btnPublicar = document.getElementById('btnSubmit');
const previewContainer = document.getElementById('previewContainer');
const imgPreview = document.getElementById('imgPreview');
const gridProdutos = document.getElementById('gridProdutos');
const editIdInput = document.getElementById('editId');
const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');

// NOVAS REFERÊNCIAS DE ESTOQUE
const estoqueAtualInput = document.getElementById('estoqueAtual');
const estoqueMinimoInput = document.getElementById('estoqueMinimo');

let urlFotoProduto = "";

// --- 1. MONITORAR USUÁRIO E CARREGAR DADOS ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        carregarPreferencias(user);
        carregarProdutosLista(); 
    } else {
        window.location.href = "index.html";
    }
});

async function carregarPreferencias(user) {
    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const nomeLoja = dados.nomeNegocio || "Meu Negócio";
            if (document.getElementById('sideNomeNegocio')) document.getElementById('sideNomeNegocio').innerText = nomeLoja;
            if (document.getElementById('navNomeNegocio')) document.getElementById('navNomeNegocio').innerText = nomeLoja;
            const corTema = dados.corTema || "#2563eb";
            document.documentElement.style.setProperty('--cor-primaria', corTema);
        }
    } catch (error) { console.error("Erro ao carregar preferências:", error); }
}

// --- 2. GESTÃO DA LISTA ---

window.carregarProdutosLista = async () => {
    if (!auth.currentUser) return;
    
    try {
        const q = query(collection(db, "produtos"), where("userId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        gridProdutos.innerHTML = "";

        if (querySnapshot.empty) {
            gridProdutos.innerHTML = `
                <div class="col-span-full p-10 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                    <p class="text-slate-400 font-bold">Nenhum produto cadastrado ainda.</p>
                </div>`;
            return;
        }

        querySnapshot.forEach((documento) => {
            const p = documento.data();
            const id = documento.id;
            const precoFormatado = p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            // Lógica visual para estoque no card da lista
            const corEstoque = (p.estoqueAtual <= (p.estoqueMinimo || 0)) ? 'text-red-500' : 'text-slate-400';

            gridProdutos.innerHTML += `
                <div class="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
                    <img src="${p.foto}" class="w-20 h-20 object-cover rounded-2xl shadow-sm">
                    <div class="flex-1">
                        <h3 class="font-black text-slate-800 text-sm leading-tight">${p.nome}</h3>
                        <p class="text-brand font-bold text-xs">${precoFormatado}</p>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[9px] uppercase font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">${p.categoria}</span>
                            <span class="text-[9px] font-black uppercase ${corEstoque}">📦 Est: ${p.estoqueAtual || 0}</span>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="prepararEdicao('${id}')" class="p-2 bg-slate-50 hover:bg-blue-50 text-blue-500 rounded-xl transition-all">✏️</button>
                        <button onclick="excluirProduto('${id}')" class="p-2 bg-slate-50 hover:bg-red-50 text-red-500 rounded-xl transition-all">🗑️</button>
                    </div>
                </div>
            `;
        });
    } catch (error) { console.error("Erro ao listar:", error); }
};

window.excluirProduto = async (id) => {
    if (confirm("Deseja remover este item do cardápio?")) {
        try {
            await deleteDoc(doc(db, "produtos", id));
            carregarProdutosLista();
        } catch (error) { alert("Erro ao excluir."); }
    }
};

window.prepararEdicao = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "produtos", id));
        if (docSnap.exists()) {
            const p = docSnap.data();
            
            editIdInput.value = id;
            document.getElementById('nomeProduto').value = p.nome;
            document.getElementById('precoVenda').value = p.preco;
            document.getElementById('categoria').value = p.categoria;
            document.getElementById('descricaoProduto').value = p.descricao;
            
            // CARREGAR DADOS DE ESTOQUE NA EDIÇÃO
            estoqueAtualInput.value = p.estoqueAtual || 0;
            estoqueMinimoInput.value = p.estoqueMinimo || 0;
            
            urlFotoProduto = p.foto;
            imgPreview.src = p.foto;
            imgPreview.classList.remove('hidden');
            previewContainer.classList.add('hidden');

            document.getElementById('btnVerCadastro').click(); 
            document.getElementById('tituloPagina').innerText = "Editando Produto";
            btnPublicar.innerHTML = "💾 SALVAR ALTERAÇÕES";
            btnCancelarEdicao.classList.remove('hidden');
        }
    } catch (error) { console.error(error); }
};

// --- 3. UPLOAD DE IMAGEM ---
inputFoto.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) return;

    previewContainer.innerHTML = `<div class="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent"></div>`;

    try {
        const nomeArquivo = `produtos/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
        const sRef = ref(storage, nomeArquivo);
        const snapshot = await uploadBytes(sRef, file);
        urlFotoProduto = await getDownloadURL(snapshot.ref);
        console.log("✅ Imagem carregada");
    } catch (err) {
        alert("Erro no upload da foto.");
        previewContainer.innerHTML = `<p class="text-[10px] font-black text-slate-400 uppercase">Erro. Tente novamente.</p>`;
    }
});

// --- 4. SALVAR / ATUALIZAR PRODUTO ---
formProduto.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const idEdicao = editIdInput.value;
    btnPublicar.disabled = true;

    // CAPTURA DOS DADOS (INCLUINDO ESTOQUE)
    const dados = {
        userId: auth.currentUser.uid,
        nome: document.getElementById('nomeProduto').value.trim(),
        preco: parseFloat(document.getElementById('precoVenda').value),
        categoria: document.getElementById('categoria').value,
        descricao: document.getElementById('descricaoProduto').value.trim(),
        
        // Novos campos de estoque convertidos para número
        estoqueAtual: parseInt(estoqueAtualInput.value) || 0,
        estoqueMinimo: parseInt(estoqueMinimoInput.value) || 0,
        
        foto: urlFotoProduto,
        status: "disponivel",
        atualizadoEm: serverTimestamp()
    };

    try {
        if (idEdicao) {
            await updateDoc(doc(db, "produtos", idEdicao), dados);
            alert("✅ Produto atualizado!");
        } else {
            dados.criadoEm = serverTimestamp();
            await addDoc(collection(db, "produtos"), dados);
            alert("🚀 Publicado com sucesso!");
        }

        resetarFormulario();
        // Volta para a lista automaticamente após salvar
        document.getElementById('btnVerLista').click();
    } catch (err) {
        console.error(err);
        alert("Erro ao salvar.");
    } finally {
        btnPublicar.disabled = false;
    }
});

// --- 5. AUXILIARES ---
function resetarFormulario() {
    formProduto.reset();
    editIdInput.value = "";
    urlFotoProduto = "";
    imgPreview.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    previewContainer.innerHTML = `
        <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-3 text-3xl">📸</div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Toque para escolher a foto</p>
    `;
    btnPublicar.innerHTML = "🚀 Publicar no Cardápio";
    btnCancelarEdicao.classList.add('hidden');
    document.getElementById('tituloPagina').innerText = "Publicar no Cardápio";
}

btnCancelarEdicao.addEventListener('click', resetarFormulario);

const realizarSair = async () => {
    if (confirm("Deseja realmente sair?")) {
        await signOut(auth);
        window.location.href = "index.html";
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', realizarSair);
