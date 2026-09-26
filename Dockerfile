# Worker de captura (ingestor) para rodar 24/7 num VPS.
# Base oficial do Playwright: já traz Chromium + todas as libs do SO (headless).
# A tag DEVE casar com a versão do playwright no package.json (aqui: 1.63.0).
# Se a tag -noble não existir, troque por -jammy.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# Usa o Chromium que já vem na imagem — não baixa de novo (evita o bloqueio de rede).
ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Só o que o worker precisa (o frontend não entra no container).
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY tools ./tools

# Padrões do modo VPS (o docker-compose sobrescreve o que precisar).
ENV HEADLESS=true \
    BROWSER_CHANNEL= \
    CAPTURE_LAPS=true \
    DATA_DIR=data \
    PORT=8080

EXPOSE 8080

# data/ (snapshots + perfil do navegador + código de pareamento) deve ser um VOLUME
# para persistir entre reinícios — assim o pareamento fica salvo (pareia 1x).
VOLUME ["/app/data"]

CMD ["node", "src/ingestor/worker.js"]
