# DOMPainter / PixelLab

Editor de pixel art e manipulador de imagens no navegador, desenvolvido em JavaScript puro. Demonstra técnicas avançadas de DOM, Canvas API, processamento de imagens e otimizações de performance.

![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)
![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange)
![CSS3](https://img.shields.io/badge/CSS3-Variables-blue)

---

## Como usar

### Iniciando o projeto

**Opção 1 – Abrir direto no navegador**
1. Abra o arquivo `index.html` no Chrome, Edge ou Firefox.

**Opção 2 – Servidor local**
```powershell
# PowerShell
cd c:\Users\Amanda\DOMPainter\DOMPainter
npx serve -p 3333
```
Acesse: **http://localhost:3333**

Ou use o script:
```powershell
.\start-server.ps1
```

### Fluxo de uso

1. **Carregar imagem**
   - Clique em **"Usar exemplo"** para uma imagem de demonstração.
   - Ou arraste uma imagem para a área de upload.
   - Ou clique na área e selecione um arquivo.

2. **Modo Canvas**
   - Visualização normal com filtros em tempo real.
   - Ajuste brilho, contraste, saturação, desfoque, etc.

3. **Modo Mosaico (Pixel Art)**
   - Clique em **Mosaico** para entrar no editor.
   - **Resolução:** 16×16, 32×32, 40×40, 64×64 ou 128×128.
   - **Ferramentas:**
     - Pintar – desenha com a cor selecionada.
     - Apagar – deixa o pixel transparente.
     - Conta-gotas – copia a cor do pixel clicado.
   - **Cor:** use o seletor de cor para escolher a cor de pintura.
   - **Redução de cores:** 2, 4, 8 ou 16 cores (quantização).
   - **Dithering:** Floyd-Steinberg ou Ordered (estilo retrô).
   - **Zoom:** scroll do mouse.
   - **Pan:** arrastar com o mouse.
   - **Hover:** mostra x, y e cor do pixel.

4. **Exportar**
   - **PNG** – imagem final.
   - **JSON** – grade de cores em formato `[["#hex", ...], ...]`.

5. **Desfazer / Refazer**
   - **Ctrl+Z** – desfazer.
   - **Ctrl+Y** – refazer.

6. **Resetar**
   - Botão **Resetar** para voltar os filtros aos valores padrão.

---

## Como foi feito

### Arquitetura

O projeto é uma SPA (Single Page Application) com três arquivos principais:

| Arquivo      | Responsabilidade                                      |
|-------------|--------------------------------------------------------|
| `index.html`| Estrutura semântica, painéis e ícones SVG inline       |
| `styles.css`| Layout, variáveis CSS, animações e tema escuro         |
| `app.js`    | Lógica, processamento de imagem e interação           |

### Tecnologias e APIs

- **Canvas API** – renderização e manipulação de pixels.
- **ImageData** – acesso direto aos pixels (RGBA).
- **CSS Variables** – tema e cores centralizadas.
- **SVG inline** – ícones escaláveis sem dependências externas.

### Técnicas de DOM e performance

| Técnica              | Uso no projeto                                      |
|----------------------|-----------------------------------------------------|
| **Cache de elementos**| Referências a elementos DOM guardadas em `$`        |
| **Event delegation**  | Um listener para todos os sliders e botões          |
| **DocumentFragment** | Inserção em lote de controles e células            |
| **requestAnimationFrame** | Batching de filtros e renderização de pintura |
| **Throttling**       | Tooltip, resize e scroll                            |
| **Debouncing**       | Utilitário para operações adiadas                   |

### Processamento de imagens

1. **Filtros CSS**
   - `brightness`, `contrast`, `saturate`, `blur`, `grayscale`, `sepia`, `hue-rotate`, `invert`.

2. **Quantização (k-means)**
   - Redução da paleta para 2, 4, 8 ou 16 cores.
   - Amostragem de pixels para melhor desempenho.

3. **Dithering**
   - **Floyd-Steinberg** – difusão de erro para suavizar transições.
   - **Ordered** – matriz 4×4 para padrão estilo Game Boy.

4. **Histórico (Undo/Redo)**
   - Pilha de estados com cópias de `Uint8ClampedArray`.
   - Limite de 50 ações.

### Otimizações de performance

- Cache de contextos de canvas (`getContext`).
- Reutilização de canvas temporário.
- Cache de `hexToRgb` para a cor atual.
- Throttle no tooltip de pixel.
- Batching de renderização durante pintura com `requestAnimationFrame`.
- Evitar redimensionamento desnecessário do canvas.
- `contain: layout paint` e `will-change` em elementos críticos.

---

## Estrutura do projeto

```
DOMPainter/
├── index.html      # Estrutura HTML e ícones SVG
├── styles.css      # Estilos, variáveis e animações
├── app.js          # Lógica principal (~550 linhas)
├── start-server.ps1 # Script para iniciar servidor
├── .gitignore
└── README.md
```

---

## Funcionalidades

### Modo Canvas
- 8 filtros em tempo real
- Visualização responsiva

### Modo Mosaico (Pixel Art)
- Editor de pixels com pintar, apagar e conta-gotas
- Resoluções: 16×16 até 128×128
- Redução de cores (2, 4, 8, 16)
- Dithering Floyd-Steinberg e Ordered
- Zoom com scroll
- Pan (arrastar para mover)
- Tooltip com x, y e cor no hover
- Undo/Redo (Ctrl+Z / Ctrl+Y)

### Exportação
- PNG
- JSON (grade de cores)

---

## Requisitos

- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Suporte a Canvas API, CSS Grid e ES6+

---

## Licença

Projeto educacional – livre para uso e modificação.
