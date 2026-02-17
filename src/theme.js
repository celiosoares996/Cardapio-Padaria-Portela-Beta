export const temas = {
    padaria_padrao: {
        primaria: "#f59e0b", // Laranja Amber
        primariaDark: "#d97706",
        fundo: "#fffbeb"
    },
    confeitaria_padrao: {
        primaria: "#FF85A1", // Rosa
        primariaDark: "#E06684",
        fundo: "#fff1f2"
    }
};

export function aplicarTema(slug) {
    const tema = temas[slug] || temas.padaria_padrao;
    document.documentElement.style.setProperty('--cor-primaria', tema.primaria);
    document.documentElement.style.setProperty('--cor-primaria-dark', tema.primariaDark);
    document.body.style.backgroundColor = tema.fundo;
    localStorage.setItem('tema-escolhido', slug);
}