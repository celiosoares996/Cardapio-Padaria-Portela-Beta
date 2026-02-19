import { db, auth, storage } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { signOut, onAuthStateChanged, EmailAuthProvider, linkWithCredential, GoogleAuthProvider, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
let emailUsuarioLogado = ""; // Variável global para garantir o e-mail

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

    // Tenta pegar o e-mail do auth imediatamente
    emailUsuarioLogado = user.email; 
    processarLink(user.uid);

    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const d = docSnap.data();
            
            // Redundância: Se o objeto user.email do Firebase vier nulo, 
            // usamos o e-mail que salvamos anteriormente no Firestore.
            if (!emailUsuarioLogado && d.email) {
                emailUsuarioLogado = d.email;
                console.log("E-mail recuperado do Firestore:", emailUsuarioLogado);
            }

            document.getElementById('nomeNegocio').value = d.nomeNegocio || "";
            document.getElementById('whatsappNegocio').value = d.whatsapp || "";
            
            if (d.configEntrega) {
                tipoEntrega.value = d.configEntrega.tipo || 'fixo';
                taxaFixa.value = d.configEntrega.taxaFixa || "";
                raioMaximo.value = d.configEntrega.raioMaximo || "";
                valorKm.value = d.configEntrega.valorKm || "";
                lojaLat.value = d.configEntrega.coords?.lat || "";
                lojaLog.value = d.configEntrega.coords?.log || "";
                
                if (d.configEntrega.tipo === 'raio') {
                    document.getElementById('btnModoRaio')?.click();
                } else {
                    document.getElementById('btnModoFixo')?.click();
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
        }
    } catch (err) { console.error("Erro ao carregar perfil:", err); }
});

// --- UPLOADS ---
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
                coords: { lat: lojaLat.value, log: lojaLog.value }
            },
            userId: user.uid,
            // Importante: Salva o e-mail no banco para futuras recuperações
            email: user.email || emailUsuarioLogado || "", 
            ultimaAtualizacao: new Date().toISOString()
        };

        await setDoc(doc(db, "usuarios", user.uid), novosDados, { merge: true });

        Swal.fire({
            icon: 'success',
            title: 'Perfil Atualizado!',
            text: 'Suas informações foram salvas com sucesso.',
            confirmButtonColor: corSelecionada
        });
        
    } catch (err) {
        console.error(err);
        Swal.fire('Erro', 'Ocorreu um erro ao salvar os dados.', 'error');
    } finally {
        btnSalvarPerfil.innerText = "Salvar Todas as Configurações";
        btnSalvarPerfil.disabled = false;
    }
});

// --- VINCULAR E-MAIL E SENHA (PROTEÇÃO CONTRA MISSING-EMAIL) ---
btnVincularSenha?.addEventListener('click', async () => {
    const user = auth.currentUser;
    const senha = novaSenhaAcesso.value;
    
    // Verificação robusta de e-mail
    let emailFinal = user?.email || emailUsuarioLogado;

    // Se ainda estiver vazio, tentamos uma última busca direta no Firestore
    if (!emailFinal && user) {
        const snapshot = await getDoc(doc(db, "usuarios", user.uid));
        if (snapshot.exists()) {
            emailFinal = snapshot.data().email;
        }
    }

    if (!emailFinal) {
        return Swal.fire({
            icon: 'error',
            title: 'Identificação Pendente',
            text: 'Não conseguimos detectar seu e-mail. Por favor, clique em "Salvar Configurações" uma vez e depois tente definir a senha.',
        });
    }

    if (!senha || senha.length < 6) {
        return Swal.fire('Atenção', 'A senha deve ter pelo menos 6 caracteres.', 'warning');
    }

    try {
        Swal.fire({ title: 'Processando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        
        const credential = EmailAuthProvider.credential(emailFinal, senha);
        
        await linkWithCredential(user, credential);
        
        Swal.fire({
            icon: 'success',
            title: 'Senha Definida!',
            text: `Agora você pode logar usando o e-mail: ${emailFinal}`,
            confirmButtonColor: '#2563eb'
        });
        novaSenhaAcesso.value = "";

    } catch (err) {
        console.error("ERRO FIREBASE:", err.code);
        
        if (err.code === 'auth/requires-recent-login') {
            const confirmacao = await Swal.fire({
                title: 'Segurança',
                text: 'Para definir uma senha, precisamos validar seu acesso Google novamente.',
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Validar com Google'
            });

            if (confirmacao.isConfirmed) {
                try {
                    const provider = new GoogleAuthProvider();
                    await reauthenticateWithPopup(user, provider);
                    // Tenta o vínculo novamente com o e-mail validado
                    const credential = EmailAuthProvider.credential(emailFinal, senha);
                    await linkWithCredential(user, credential);
                    Swal.fire('Sucesso!', 'Senha definida com sucesso!', 'success');
                } catch (reauthErr) {
                    Swal.fire('Erro', 'Falha na validação de identidade.', 'error');
                }
            }
        } else if (err.code === 'auth/credential-already-in-use') {
            Swal.fire('Aviso', 'Este e-mail já possui uma senha vinculada.', 'warning');
        } else {
            Swal.fire('Erro', `Não foi possível definir a senha: ${err.code}`, 'error');
        }
    }
});

// --- AUXILIARES (COPIAR, GPS, SAIR) ---
document.getElementById('btnCopiarLink')?.addEventListener('click', () => {
    if(inputLink && inputLink.value) {
        navigator.clipboard.writeText(inputLink.value);
        Swal.fire({ icon: 'success', title: 'Copiado!', text: 'Link do cardápio pronto para compartilhar.', timer: 1500, showConfirmButton: false });
    }
});

document.getElementById('btnCapturarGps')?.addEventListener('click', () => {
    statusGPS.innerHTML = "⏳ Localizando...";
    navigator.geolocation.getCurrentPosition((pos) => {
        lojaLat.value = pos.coords.latitude;
        lojaLog.value = pos.coords.longitude;
        statusGPS.innerHTML = "✅ Localização Base Fixada";
        Swal.fire('Sucesso', 'Coordenadas capturadas!', 'success');
    }, (err) => {
        statusGPS.innerHTML = "❌ Erro ao localizar";
        Swal.fire('Erro', 'Por favor, ative o GPS do navegador.', 'error');
    });
});

const sair = async () => {
    const result = await Swal.fire({
        title: 'Sair do Sistema?',
        text: "Você precisará fazer login novamente para acessar.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, sair!',
        cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
        signOut(auth).then(() => window.location.href="index.html");
    }
};

document.getElementById('btnSairDesktop')?.addEventListener('click', sair);
document.getElementById('btnSairMobile')?.addEventListener('click', sair);
