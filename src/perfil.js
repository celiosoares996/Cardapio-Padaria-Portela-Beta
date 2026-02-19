import { db, auth, storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { signOut, onAuthStateChanged, EmailAuthProvider, linkWithCredential } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- REFERÊNCIAS DO DOM ---
const inputLink = document.getElementById('linkCardapio');
const qrcodePrintDiv = document.getElementById("qrcodePrint");
const sideNome = document.getElementById('sideNomeNegocio');
const mobileNome = document.getElementById('mobileNomeNegocio');
const formPerfil = document.getElementById('formPerfil');
const btnSalvarPerfil = document.getElementById('btnSalvarPerfil');

// Campos de entrega e logística
const tipoEntrega = document.getElementById('tipoEntrega');
const taxaFixa = document.getElementById('taxaFixa');
const raioMaximo = document.getElementById('raioMaximo');
const valorKm = document.getElementById('valorKm');
const lojaLat = document.getElementById('lojaLat');
const lojaLog = document.getElementById('lojaLog');
const statusGPS = document.getElementById('statusGPS');

// Referências para Segurança
const btnVincularSenha = document.getElementById('btnVincularSenha');
const novaSenhaAcesso = document.getElementById('novaSenhaAcesso');

let urlFotoFinal = "";
let urlCapaFinal = ""; 

// --- FUNÇÃO: APLICAR TEMA DINÂMICO ---
function aplicarCor(cor) {
    if (!cor) return;
    document.documentElement.style.setProperty('--cor-primaria', cor);
    const radio = document.querySelector(`input[name="temaCor"][value="${cor}"]`);
    if (radio) radio.checked = true;
}

// --- FUNÇÃO: EXIBIR IMAGENS (PREVIEW) ---
function atualizarPreviewImagem(tipo, url) {
    if (tipo === 'perfil') {
        const img = document.getElementById('imgLogo');
        const placeholder = document.getElementById('placeholderEmoji');
        if (img && url) {
            img.src = url;
            img.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        }
    } else if (tipo === 'capa') {
        const imgCapa = document.getElementById('imgCapa');
        const placeholderCapa = document.getElementById('placeholderCapa');
        if (imgCapa && url) {
            imgCapa.src = url;
            imgCapa.classList.remove('hidden');
            if (placeholderCapa) placeholderCapa.classList.add('hidden');
        }
    }
}

// --- FUNÇÃO: GERAR LINK E QR CODE ---
function processarLink(uid) {
    try {
        const link = `${window.location.origin}/cardapio.html?id=${uid}`;
        if (inputLink) inputLink.value = link;

        setTimeout(() => {
            if (typeof QRCode !== "undefined" && qrcodePrintDiv) {
                qrcodePrintDiv.innerHTML = "";
                new QRCode(qrcodePrintDiv, { 
                    text: link, 
                    width: 250, 
                    height: 250,
                    colorDark: "#000000",
                    colorLight: "#ffffff"
                });
            }
        }, 1000);
    } catch (e) { console.error("Erro ao gerar QR Code:", e); }
}

// --- ESCUTAR ESTADO DO USUÁRIO ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    processarLink(user.uid);

    try {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists()) {
            const d = docSnap.data();
            
            // Preencher Campos de Texto
            document.getElementById('nomeNegocio').value = d.nomeNegocio || "";
            document.getElementById('whatsappNegocio').value = d.whatsapp || "";
            
            // Configurações de Entrega
            if (d.configEntrega) {
                tipoEntrega.value = d.configEntrega.tipo || 'fixo';
                taxaFixa.value = d.configEntrega.taxaFixa || "";
                raioMaximo.value = d.configEntrega.raioMaximo || "";
                valorKm.value = d.configEntrega.valorKm || "";
                lojaLat.value = d.configEntrega.coords?.lat || "";
                lojaLog.value = d.configEntrega.coords?.log || "";
                
                if (d.configEntrega.tipo === 'raio') {
                    document.getElementById('btnModoRaio').click();
                } else {
                    document.getElementById('btnModoFixo').click();
                }

                if (d.configEntrega.coords?.lat) {
                    statusGPS.innerHTML = "✅ Localização Base Fixada";
                }
            }

            const titulo = d.nomeNegocio || "Minha Loja";
            if(sideNome) sideNome.innerText = titulo;
            if(mobileNome) mobileNome.innerText = titulo;
            
            if (d.fotoPerfil) {
                urlFotoFinal = d.fotoPerfil;
                atualizarPreviewImagem('perfil', d.fotoPerfil);
            }
            if (d.fotoCapa) {
                urlCapaFinal = d.fotoCapa;
                atualizarPreviewImagem('capa', d.fotoCapa);
            }
            aplicarCor(d.corTema);
        } else {
            if(sideNome) sideNome.innerText = "Configurar Loja";
            if(mobileNome) mobileNome.innerText = "Configurar Loja";
        }
    } catch (err) { console.error("Erro ao carregar perfil:", err); }
});

// --- UPLOADS PARA FIREBASE STORAGE ---
const realizarUpload = async (tipo, file) => {
    const nomeArquivo = `${Date.now()}_${file.name}`;
    const sRef = ref(storage, `${tipo}/${auth.currentUser.uid}/${nomeArquivo}`);
    await uploadBytes(sRef, file);
    return await getDownloadURL(sRef);
};

document.getElementById('fileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) return;
    try {
        btnSalvarPerfil.disabled = true;
        btnSalvarPerfil.innerText = "⏳ ENVIANDO LOGO...";
        urlFotoFinal = await realizarUpload('logos', file);
        atualizarPreviewImagem('perfil', urlFotoFinal);
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
    } catch (err) { 
        Swal.fire('Erro', 'Não foi possível subir a imagem.', 'error');
        btnSalvarPerfil.disabled = false; 
    }
});

document.getElementById('fileCapa')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !auth.currentUser) return;
    try {
        btnSalvarPerfil.disabled = true;
        btnSalvarPerfil.innerText = "⏳ ENVIANDO CAPA...";
        urlCapaFinal = await realizarUpload('capas', file);
        atualizarPreviewImagem('capa', urlCapaFinal);
        btnSalvarPerfil.disabled = false;
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
    } catch (err) { 
        Swal.fire('Erro', 'Não foi possível subir a capa.', 'error');
        btnSalvarPerfil.disabled = false; 
    }
});

// --- SALVAR TUDO NO FIRESTORE ---
formPerfil?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return;

    btnSalvarPerfil.innerText = "⏳ SALVANDO...";
    btnSalvarPerfil.disabled = true;

    try {
        const corSelecionada = document.querySelector('input[name="temaCor"]:checked')?.value || "#2563eb";
        
        const novosDados = {
            nomeNegocio: document.getElementById('nomeNegocio').value.trim(),
            whatsapp: document.getElementById('whatsappNegocio').value.trim(),
            fotoPerfil: urlFotoFinal,
            fotoCapa: urlCapaFinal,
            corTema: corSelecionada,
            configEntrega: {
                tipo: tipoEntrega.value,
                taxaFixa: parseFloat(taxaFixa.value) || 0,
                raioMaximo: parseFloat(raioMaximo.value) || 0,
                valorKm: parseFloat(valorKm.value) || 0,
                coords: {
                    lat: lojaLat.value,
                    log: lojaLog.value
                }
            },
            userId: user.uid,
            ultimaAtualizacao: new Date().toISOString()
        };

        await setDoc(doc(db, "usuarios", user.uid), novosDados, { merge: true });

        Swal.fire({
            icon: 'success',
            title: 'Perfil Atualizado!',
            text: 'Suas informações foram salvas com sucesso.',
            confirmButtonColor: corSelecionada
        });
        
        if(sideNome) sideNome.innerText = novosDados.nomeNegocio;
        if(mobileNome) mobileNome.innerText = novosDados.nomeNegocio;

    } catch (err) {
        console.error(err);
        Swal.fire('Erro', 'Ocorreu um erro ao salvar os dados.', 'error');
    } finally {
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
        btnSalvarPerfil.disabled = false;
    }
});

// --- VINCULAR E-MAIL E SENHA (SEGURANÇA) ---
btnVincularSenha?.addEventListener('click', async () => {
    const user = auth.currentUser;
    const senha = novaSenhaAcesso.value;

    if (!senha || senha.length < 6) {
        return Swal.fire('Atenção', 'A senha deve ter pelo menos 6 caracteres.', 'warning');
    }

    try {
        Swal.fire({ title: 'Vinculando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        
        // Cria a credencial com o e-mail logado e a nova senha escolhida
        const credential = EmailAuthProvider.credential(user.email, senha);
        
        // Vincula ao usuário atual do Google
        await linkWithCredential(user, credential);
        
        Swal.fire({
            icon: 'success',
            title: 'Senha Definida!',
            text: 'Agora você pode entrar usando seu e-mail e esta senha.',
            confirmButtonColor: '#2563eb'
        });
        novaSenhaAcesso.value = "";
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/credential-already-in-use') {
            Swal.fire('Erro', 'Este método de login já está em uso.', 'error');
        } else {
            Swal.fire('Erro', 'Não foi possível definir a senha. Tente novamente.', 'error');
        }
    }
});

// --- COPIAR LINK ---
document.getElementById('btnCopiarLink')?.addEventListener('click', () => {
    if(inputLink && inputLink.value) {
        navigator.clipboard.writeText(inputLink.value);
        Swal.fire({ icon: 'success', title: 'Copiado!', text: 'Link copiado.', timer: 1500, showConfirmButton: false });
    }
});

// --- CAPTURAR GPS ---
document.getElementById('btnCapturarGps')?.addEventListener('click', () => {
    statusGPS.innerHTML = "⏳ Localizando...";
    navigator.geolocation.getCurrentPosition((pos) => {
        lojaLat.value = pos.coords.latitude;
        lojaLog.value = pos.coords.longitude;
        statusGPS.innerHTML = "✅ Localização Base Fixada";
        Swal.fire('Sucesso', 'Localização capturada com sucesso!', 'success');
    }, (err) => {
        statusGPS.innerHTML = "❌ Erro ao localizar";
        Swal.fire('Erro', 'Por favor, ative o GPS e permita o acesso.', 'error');
    });
});

// --- FUNÇÃO SAIR ---
const sair = async () => {
    const result = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Você precisará fazer login novamente para acessar.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, sair!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        signOut(auth).then(() => window.location.href="index.html");
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', sair);
document.getElementById('btnSairMobile')?.addEventListener('click', sair);
