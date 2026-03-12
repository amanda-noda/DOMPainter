# DOMPainter

Ferramenta de manipulação de imagens no navegador, demonstrando **conhecimento avançado de DOM** e **otimizações de performance** em JavaScript.

## Funcionalidades

- **Upload de imagens** – Arraste ou clique para carregar
- **8 filtros em tempo real** – Brilho, contraste, saturação, desfoque, escala de cinza, sépia, matiz, inverter
- **Dois modos de visualização:**
  - **Canvas** – Renderização via Canvas API (alta performance)
  - **Mosaico DOM** – Imagem representada por ~1600 elementos `<div>` (demonstração de manipulação DOM em massa)
- **Monitor de performance** – Contador de FPS e quantidade de elementos DOM

## Técnicas de DOM e Performance

| Técnica | Uso no projeto |
|---------|-----------------|
| **DocumentFragment** | Criação em lote dos controles de filtro e das células do mosaico |
| **Event Delegation** | Um único listener para todos os sliders de filtro |
| **Cache de elementos** | Evita `querySelector` repetidos |
| **requestAnimationFrame** | Atualizações suaves e sincronizadas com o refresh da tela |
| **Throttling** | Handler de resize limitado a ~6 execuções/segundo |
| **Batch reads/writes** | Agrupamento de leituras e escritas no DOM para reduzir reflows |

## Como usar

1. Abra `index.html` no navegador
2. Clique em **"Usar imagem de exemplo"** ou carregue sua própria imagem
3. Ajuste os filtros em tempo real
4. Alterne entre **Canvas** e **Mosaico DOM** para comparar os modos

## Estrutura

```
DOMPainter/
├── index.html   # Estrutura semântica
├── styles.css   # Estilos (variáveis CSS, layout responsivo)
├── app.js       # Lógica principal
└── README.md
```

## Requisitos

Navegador moderno com suporte a:
- Canvas API
- CSS Grid
- ES6+
