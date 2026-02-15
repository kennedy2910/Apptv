<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LinearTV Pro (NEX TV Player)

Este projeto executa canais "lineares" (parece ao vivo) a partir de uma grade com `schedule_start` + `items[]`.
Agora ele também consegue carregar os canais dinamicamente a partir do **EDGE**.

## Run Locally

**Prerequisites:**  Node.js


1. Instale as dependências:
   `npm install`

2. (Opcional) Aponte para o EDGE.

   **Opção A (mais simples, pode dar CORS):**

   - Crie um arquivo `.env.local` e defina:
     `VITE_EDGE_BASE_URL=http://SEU_EDGE:9100`

   **Opção B (recomendado em DEV, evita CORS via proxy do Vite):**

   - `.env.local`:
     - `VITE_EDGE_BASE_URL=/edge`
     - `EDGE_PROXY_TARGET=http://SEU_EDGE:9100`

3. Rode:
   `npm run dev`
