# Captura 24/7 num VPS — os 15 dias de Jardim Camburi

Objetivo: rodar o worker sem parar do **dia 1 ao dia 16**, capturando as sessões de
**Jardim Camburi**, pra popular o banco com o **ritmo por kart** (aba Karts).

## 1. Contratar o VPS
Qualquer um barato serve (Hetzner CX22 ~€4, DigitalOcean/Contabo ~US$5). Peça:
- **Ubuntu 22.04/24.04**, **2 GB de RAM** (1 GB arrisca OOM — o Chromium come memória).
- Anote o **IP** do VPS.

## 2. Instalar Docker (uma vez)
```bash
curl -fsSL https://get.docker.com | sh
```
(Isso já traz o `docker` + `docker compose`.)

## 3. Trazer o projeto
```bash
git clone -b integra-pdr606 https://github.com/alvaroarmani/EnduroKartTeam.git
cd EnduroKartTeam
```

## 4. (Opcional) Supabase
Se quiser gravar também no Supabase, crie um `.env` ao lado do compose:
```bash
cp .env.vps.example .env
nano .env   # preencha SUPABASE_URL e SUPABASE_KEY
```
Sem isso, os dados ficam em `data/*.jsonl` no próprio VPS (a agregação lê de lá).

## 5. Subir a captura
```bash
docker compose up -d --build
docker compose logs -f          # acompanha (Ctrl+C sai do log, o worker segue)
```
> Se a imagem `...:v1.63.0-noble` falhar, troque no `Dockerfile` por `v1.63.0-jammy` e rode de novo.

## 6. Parear 1× (só na primeira vez)
No navegador do seu celular/PC, abra **`http://IP_DO_VPS:8080`** → aparece o **código de pareamento**.
No app **MyLapTime → Carreira**, cole o código (ou escaneie o QR).
- O perfil do navegador é **persistente** (volume `data/`), então o login **fica salvo** —
  não precisa parear a cada reinício.

## 7. Confirmar que está capturando
- `http://IP_DO_VPS:8080` deve mostrar **CAPTURANDO** e a lista de eventos.
- `http://IP_DO_VPS:8080/events` lista as sessões online (JSON).
- `docker compose logs -f` mostra os ciclos: `... online · capturando N [filtro: camburi]`.

## 8. Ver o ritmo por kart (quando quiser)
```bash
docker compose exec worker node tools/kart-pace.js camburi
```
Gera o ranking e o `data/kart-pace.json`. No dia da prova, é isso que a aba **Karts** consome
(aponte `VITE_KARTPACE_URL` do frontend pro `http://IP_DO_VPS:8080`… — ou copie o json).

## 9. Parar / atualizar
```bash
docker compose down            # para
docker compose up -d --build   # sobe de novo (dados e pareamento continuam no volume)
```

---

## Avisos honestos
- **Pareamento persistente é a aposta, não a garantia.** O perfil salva cookies/login; se o
  mylaptime guardar a sessão no perfil (o esperado), pareia 1× e pronto mesmo após reboot. Se o
  pareamento for só de circuito (memória do servidor deles), um **reinício** pode pedir novo
  pareamento — por isso `restart: unless-stopped` (só reinicia se cair) e evitamos `down`
  desnecessário. Confirme nos primeiros dias: reinicie 1× e veja se voltou pareado.
- **RAM:** se o container morrer sozinho, é OOM → suba pra 2–4 GB.
- **Filtro:** `EVENT_FILTER=camburi` pega qualquer sessão cujo local contenha "camburi". Confirme
  como o nome da pista aparece no mylaptime (pode ser "Jardim Camburi") e ajuste se precisar.
- **Data:** só interessa a partir do **dia 1** (traçado mensal do campeonato). Antes disso é outra
  pista — se ligar antes, descarte esses dias na agregação.
- **Segurança:** a porta 8080 é uma página de status (sem segredos além do código de pareamento
  temporário). Se quiser, restrinja no firewall do VPS ao seu IP.
