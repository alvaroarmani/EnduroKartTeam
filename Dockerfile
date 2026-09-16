# Imagem oficial do Playwright — já traz Chromium + libs (sem download em runtime).
# Manter a tag alinhada com a versão do playwright no package.json.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# Browsers já estão na imagem; não baixar de novo no npm install.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV HEADLESS=true
# BROWSER_CHANNEL vazio => usa o Chromium embutido da imagem.
ENV BROWSER_CHANNEL=

# Persistir buffer/estado e o código de pareamento fora do container (montar volume em /app/data).
VOLUME ["/app/data"]

CMD ["node", "src/ingestor/worker.js"]
