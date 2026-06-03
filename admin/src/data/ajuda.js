// Conteúdo da Central de Ajuda (Tela 11) como ESTRUTURA DE DADOS — editável sem
// mexer no componente Ajuda.jsx. Cada seção tem metadados (id, num, label, icon,
// kw para busca, title, lead) e uma lista de `blocks`.
//
// Tipos de bloco suportados pelo renderer (ver Ajuda.jsx):
//   { type: 'p',        text }                              parágrafo
//   { type: 'h3',       text, id? }                         subtítulo (id = âncora)
//   { type: 'ul',       items: [text] }                     lista de marcadores
//   { type: 'steps',    items: [text] }                     passos numerados
//   { type: 'callout',  variant: 'info'|'atencao'|'perigo'|'dica', title?, text }
//   { type: 'code',     label?, lang?, code }               bloco de código
//   { type: 'shot',     text }                              placeholder de screenshot
//   { type: 'glossary', items: [[termo, definicao]] }       glossário
//   { type: 'faq',      items: [{ q, a }] }                 acordeão de perguntas
//   { type: 'table',    head: [..], rows: [[..]] }          tabela
//   { type: 'statuses', items: [[statusKey, label, desc]] } lista de status (badges)
//   { type: 'printRunbook' }                                botão "Imprimir runbook"
//
// Markup inline (dentro de strings de texto): **negrito**, `mono`,
//   {kbd:F5}, {badge:cotando|Cotando}, {ok:Ativa}, {star}
// Código (campo `code`) é renderizado cru, sem markup.

export const LAST_UPDATED = '02/06/2026';

export const SECOES = [
  /* ===================================================================== 01 */
  {
    id: 'bem-vindo', num: '01', label: 'Bem-vindo', icon: 'book',
    kw: 'introducao glossario o que é como funciona termos os aggilizador edge function fipe api key premio franquia sentry',
    title: 'Bem-vindo ao BemSeguro Hub',
    lead: 'O Hub é o painel onde a equipe da corretora cria e acompanha cotações de seguro auto sem precisar entrar em cada seguradora, uma por uma.',
    blocks: [
      { type: 'p', text: 'Quando um cliente pede uma cotação, o Hub envia os dados do veículo e do condutor para **todas as seguradoras ativas ao mesmo tempo**, recebe os preços de volta e organiza tudo em uma única tela. O que antes levava uma manhã inteira de digitação repetida passa a levar poucos minutos.' },
      { type: 'p', text: 'Você não precisa entender nada de programação para usar o sistema. Esta seção explica as palavras que vão aparecer pelo caminho — guarde esta página como referência.' },
      { type: 'callout', variant: 'info', title: 'Como ler este guia', text: 'Cada seção tem um passo a passo e exemplos. Os blocos cinza com letra de máquina de escrever (`assim`) são informações técnicas — você raramente vai precisar mexer neles, mas estão aqui caso o suporte peça.' },
      { type: 'h3', text: 'O fluxo em uma frase' },
      { type: 'p', text: 'Cliente pede o seguro → você cria a **cotação** no Hub → o sistema consulta as seguradoras → os preços voltam → você envia a melhor opção ao cliente. Cada uma dessas cotações vira uma **OS** que você acompanha do começo ao fim.' },
      { type: 'shot', text: 'Dashboard do Hub logo após o login: indicadores do dia, últimas OS e alertas.' },
      { type: 'h3', text: 'Glossário rápido' },
      { type: 'glossary', items: [
        ['OS', '“Ordem de Serviço”. É o nome de cada cotação dentro do sistema, identificada por um número como `OS-2841`. Tudo gira em torno da OS: ela nasce, é cotada, e termina como cotada, cancelada ou com erro.'],
        ['Aggilizador', 'O serviço parceiro que conversa de fato com as seguradoras em nome do Hub. Se essa conexão cai, nenhuma cotação volta.'],
        ['Edge Function', 'São os “motores” que rodam por trás dos botões — pequenos programas que disparam a cotação, buscam dados da placa e salvam os resultados. Você nunca os aciona diretamente; eles trabalham sozinhos quando você clica em algo.'],
        ['FIPE', 'A tabela oficial de preços de veículos do Brasil. Cada modelo tem um **código FIPE** (ex.: `005340-7`) que identifica exatamente versão, motor e ano — é o que as seguradoras usam para calcular o preço.'],
        ['Lookup de placa', 'A busca automática que, a partir da placa, descobre marca, modelo, ano, **código FIPE e chassi** do carro. Poupa digitação e evita erro.'],
        ['API key', 'Uma “senha de sistema”. É o que permite que o CRM da corretora peça cotações ao Hub automaticamente, sem ninguém digitar. Veja a seção **API Keys**.'],
        ['Idempotency-Key', 'Uma marca única em cada pedido de cotação que impede a criação de OS duplicada — por exemplo, se você clicar duas vezes em “Criar OS”. O sistema entende que é o mesmo pedido e cria uma só.'],
        ['Prêmio', 'O **preço do seguro** — o valor que o cliente paga. Não confunda com indenização.'],
        ['Franquia', 'O valor que o cliente paga do próprio bolso em caso de sinistro, antes da seguradora cobrir o resto.'],
        ['Recotar', 'Disparar a cotação de novo para uma OS que já existe. Útil quando deu erro ou poucas seguradoras responderam.'],
        ['JWT', 'A “credencial” que o navegador guarda depois que você faz login. É ela que prova ao sistema que é você, sem pedir a senha a cada clique.'],
        ['Railway', 'O servidor onde o Hub fica hospedado. “Railway saudável” na tela de Monitoring significa que a base do sistema está no ar.'],
        ['Supabase', 'Onde ficam guardados os dados (as OS, as cotações, os usuários) e o login. É o “arquivo” e a “portaria” do sistema.'],
        ['Sentry', 'A ferramenta que avisa a equipe técnica automaticamente quando algo dá errado no backend. Quando você ouvir “chegou um alerta no Sentry”, é um aviso automático de erro (ver Runbook).'],
        ['Polling', 'Como as seguradoras não respondem todas na mesma hora, o Hub fica “perguntando de novo” a cada poucos segundos se o preço já saiu. Por isso uma OS pode ficar alguns minutos em **Cotando**.'],
      ] },
    ],
  },

  /* ===================================================================== 02 */
  {
    id: 'acesso', num: '02', label: 'Acesso ao Painel', icon: 'lock',
    kw: 'login entrar senha esqueci recuperar usuarios permissoes sair logout conta supabase manter conectado meu perfil trocar senha historico atividade operador papel',
    title: 'Acesso ao Painel',
    lead: 'Como entrar no Hub, recuperar a senha e gerenciar quem da equipe tem acesso.',
    blocks: [
      { type: 'h3', text: 'Entrar no sistema' },
      { type: 'steps', items: [
        'Abra o endereço do Hub no navegador (qualquer navegador atualizado serve).',
        'Digite seu **e-mail corporativo** e sua **senha**.',
        'Clique em **Entrar**. Você cai direto no Dashboard.',
      ] },
      { type: 'shot', text: 'Tela de login com campos de e-mail e senha, a opção “Manter conectado” e o botão “Entrar”.' },
      { type: 'callout', variant: 'dica', title: 'Sobre “Manter conectado”', text: 'O login tem a opção **Manter conectado**, que já vem **marcada por padrão** — assim você não digita a senha toda hora no computador da corretora. **Desmarque** em computador compartilhado ou público.' },
      { type: 'h3', text: 'Esqueci minha senha' },
      { type: 'p', text: 'Na tela de login há o link **Esqueci a senha**. No piloto ele não envia e-mail de redefinição: ao clicar, o sistema mostra um aviso orientando a **falar com o administrador**. Como as contas são criadas e redefinidas manualmente, peça ao administrador para gerar uma senha nova.' },
      { type: 'callout', variant: 'atencao', title: 'Sem cadastro público', text: 'Ninguém se cadastra sozinho no Hub. Toda conta é criada manualmente no **Supabase Auth** — isso mantém o acesso restrito à equipe.' },
      { type: 'h3', text: 'Gerenciamento de usuários' },
      { type: 'p', text: 'No piloto não há tela de cadastro dentro do Hub. Aqui, **“administrador” não é um papel do app** (o piloto usa um acesso único) — é simplesmente **a pessoa que tem acesso ao Supabase** e cria/edita as contas lá. Se você precisa de um novo acesso para um colega, peça a essa pessoa.' },
      { type: 'p', text: 'Cada pessoa deve ter o **seu próprio login**. Tudo que acontece no sistema fica registrado no **Audit Log** com o nome de quem fez — senhas compartilhadas tornam impossível saber quem fez o quê.' },
      { type: 'h3', text: 'Meu perfil' },
      { type: 'p', text: 'No menu do **avatar** (canto superior direito) há a opção **Meu perfil**, que abre a sua conta no Hub. A tela é dividida em três partes:' },
      { type: 'ul', items: [
        '**Dados da conta** — seu nome, e-mail, papel, último login e a data de criação da conta. São **somente leitura** no piloto; o **e-mail não é editável** (mudanças de cadastro são feitas pelo administrador no Supabase). O papel aparece como **“Operador”** (ainda não há perfis diferentes no piloto).',
        '**Trocar senha** — informe a **senha atual**, a **nova senha** (mínimo de 8 caracteres) e a **confirmação**, e clique em **Salvar nova senha**. Você continua conectado nesta sessão e usa a nova senha no próximo login.',
        '**Histórico de atividade** — as últimas ações feitas pelo painel (cotações e recotações). No piloto é o **histórico geral do painel**, ainda não separado por usuário.',
      ] },
      { type: 'h3', text: 'Encerrar a sessão' },
      { type: 'p', text: 'Clique no **seu avatar** (canto superior direito, com suas iniciais) para abrir o menu e escolha **Sair**. O sistema encerra a sessão no Supabase e leva você de volta à tela de login. **Sempre saia** ao terminar de usar um computador compartilhado.' },
      { type: 'steps', items: [
        'Clique no avatar com suas iniciais, no topo à direita.',
        'No menu que abre, clique em **Sair** (ou em **Meu perfil** para ver sua conta).',
        'Aguarde o **“Saindo…”** — você é redirecionado para a tela de login.',
      ] },
    ],
  },

  /* ===================================================================== 03 */
  {
    id: 'criando', num: '03', label: 'Criando Cotações', icon: 'plus',
    kw: 'nova cotacao criar passo a passo placa lookup dados obrigatorios veiculo condutor cobertura apolice anterior descartar',
    title: 'Criando Cotações',
    lead: 'O caminho completo para criar uma nova cotação na mão, a partir da placa do veículo.',
    blocks: [
      { type: 'p', text: 'A maioria das cotações chega sozinha pelo CRM. Mas quando um cliente liga ou aparece na corretora, você cria a cotação manualmente em **Nova Cotação**.' },
      { type: 'h3', text: 'Passo a passo' },
      { type: 'steps', items: [
        'Na barra lateral, clique em **Nova Cotação**.',
        'Digite a **placa** e clique em **Buscar placa** — ou simplesmente **saia do campo** (ao perder o foco o lookup dispara sozinho). O sistema preenche marca, modelo, ano, código FIPE e chassi.',
        'Confira os dados do veículo que aparecerem. Se algo estiver errado, corrija na mão.',
        'Preencha os **dados do segurado e do condutor**: nome, CPF, data de nascimento, sexo e estado civil. Se o condutor é o próprio segurado, deixe a opção marcada.',
        'Informe o **CEP de pernoite** (onde o carro dorme) — ele influencia bastante o preço.',
        'Se houver seguro anterior, abra **Apólice anterior** e preencha a seguradora, o número e a **classe de bônus** — isso costuma baratear a cotação.',
        'Revise tudo e clique em **Criar OS**.',
      ] },
      { type: 'p', text: 'Ao clicar em **Criar OS**, você é levado direto para o **detalhe da OS**, que já começa a acompanhar as cotações chegando (status **Cotando**). Se desistir antes, o botão **Descartar** abandona a cotação (pede confirmação) e volta para a lista de OS.' },
      { type: 'shot', text: 'Formulário de Nova Cotação com o campo de placa em destaque e o botão “Buscar placa” ao lado.' },
      { type: 'h3', text: 'Lookup de placa' },
      { type: 'p', text: 'Ao buscar a placa, o Hub consulta e devolve os dados do carro em poucos segundos. Use sempre que possível: é mais rápido e evita errar o modelo.' },
      { type: 'code', label: 'exemplo de retorno do lookup', lang: 'json', code: `{
  "placa": "JCU9D37",
  "modelo": "VOLKSWAGEN - SAVEIRO - ROBUST 1.6",
  "anoModelo": "2024",
  "anoFabricacao": "2024",
  "chassi": "9BWKL45U1SP009017",
  "fipe": "0053407"
}` },
      { type: 'shot', text: 'Bloco “Dados do Veículo” já preenchido pelo lookup: modelo, ano, código FIPE e chassi.' },
      { type: 'callout', variant: 'atencao', title: 'Quando a placa não é encontrada', text: 'Placas muito novas ou de carro recém-emplacado podem não voltar. Nesse caso, preencha marca, modelo e **código FIPE** manualmente. Sem o código FIPE certo, o preço sai errado.' },
      { type: 'h3', text: 'Dados obrigatórios (o formulário não envia sem eles)' },
      { type: 'p', text: 'Estes campos aparecem marcados com um {star} laranja — sem eles o botão “Criar OS” não envia:' },
      { type: 'ul', items: [
        '**Segurado:** nome completo, CPF, data de nascimento, sexo e estado civil.',
        '**Veículo:** placa.',
        '**Localização:** CEP de pernoite.',
        '**Condutor:** nome (e CPF) — só se o condutor **não** for o próprio segurado.',
      ] },
      { type: 'h3', text: 'Essenciais para o preço sair certo (mas não bloqueiam o envio)' },
      { type: 'p', text: 'O formulário deixa criar a OS sem eles, porém, se estiverem errados ou vazios, o preço sai errado — confira sempre: **código FIPE**, **modelo**, **ano-modelo / ano de fabricação** e **chassi**. Normalmente o **lookup de placa** preenche todos automaticamente.' },
      { type: 'callout', variant: 'dica', text: 'Não tem certeza de uma cobertura específica? As coberturas padrão Auto já vão fixas no envio. É melhor enviar uma cotação base rápido e **recotar** depois com ajustes do que travar esperando o cliente decidir cada detalhe.' },
    ],
  },

  /* ===================================================================== 04 */
  {
    id: 'acompanhando', num: '04', label: 'Acompanhando OS', icon: 'list',
    kw: 'status pendente cotando cotado erro cancelada recotar cancelar acoes pdf detalhe lista ordens erros recentes extraindo documentos revisao manual aguardando crm callback ia cnh crlv',
    title: 'Acompanhando OS',
    lead: 'Como ler o status de cada cotação, abrir o detalhe e usar as ações de recotar e cancelar.',
    blocks: [
      { type: 'p', text: 'Toda cotação aparece em **Ordens de Serviço**, da mais recente para a mais antiga. O número ao lado do menu mostra quantas estão pedindo sua atenção (pendentes e cotando).' },
      { type: 'h3', text: 'O que cada status significa' },
      { type: 'statuses', items: [
        ['pendente', 'Pendente', 'Criada, mas a cotação ainda não foi disparada. Costuma durar só um instante.'],
        ['extraindo_documentos', 'Extraindo documentos', 'A IA está lendo os documentos (CNH/CRLV) para preencher os dados. Dura só alguns segundos.'],
        ['revisao_manual', 'Revisão manual', 'A IA detectou uma inconsistência entre os dados do formulário e os documentos. Abra a OS, confira e confirme/corrija os dados antes de cotar.'],
        ['cotando', 'Cotando', 'O Hub está perguntando às seguradoras. Aguarde — os preços chegam aos poucos.'],
        ['cotado', 'Cotado', 'Pronto! Pelo menos uma seguradora devolveu preço. Pode abrir e enviar ao cliente.'],
        ['callback_pendente', 'Aguardando CRM', 'A cotação ficou pronta e o sistema está tentando enviá-la de volta ao CRM. O reenvio é automático (retry) — não precisa fazer nada.'],
        ['erro', 'Erro', 'Algo impediu a cotação (ex.: a conexão com o Aggilizador caiu). O motivo aparece em Monitoring → “Erros recentes”; veja lá e recote.'],
        ['cancelada', 'Cancelada', 'Encerrada por um operador. Não recebe mais preços.'],
      ] },
      { type: 'callout', variant: 'atencao', title: '“Revisão manual” pede a sua ação', text: 'Diferente dos outros, **Revisão manual** não anda sozinho: a IA achou um conflito entre o formulário e os documentos (CNH/CRLV) e **espera por você**. Abra a OS, confirme ou corrija os dados e siga — só então a cotação é disparada.' },
      { type: 'callout', variant: 'info', title: 'Estados da integração com o CRM/IA', text: '**Extraindo documentos**, **Revisão manual** e **Aguardando CRM** fazem parte da integração automática com o CRM (leitura de documentos por IA e reenvio da cotação). Você verá esses status conforme essa integração for ativada.' },
      { type: 'callout', variant: 'info', title: 'Onde ver o motivo de um erro', text: 'O **detalhe da OS não mostra a mensagem de erro**. Para saber por que uma OS deu erro, vá em **Monitoring → “Erros recentes”** — lá aparece a OS afetada e o motivo.' },
      { type: 'h3', text: 'Abrir o detalhe' },
      { type: 'p', text: 'Clique em qualquer linha da lista para abrir a OS. Lá você vê os dados do cliente e do veículo, os cards de cotação por seguradora (com o **Melhor Preço** em destaque) e o JSON dos dados de risco. Se nenhuma seguradora retornar preço, o detalhe mostra **“Nenhuma seguradora retornou prêmio”** — tente recotar ou confira os dados de risco.' },
      { type: 'shot', text: 'Detalhe da OS com os cards de cotação por seguradora e o painel de dados do segurado/veículo.' },
      { type: 'h3', text: 'Ações disponíveis' },
      { type: 'ul', items: [
        '**Abrir PDF:** cada preço que voltou com proposta tem um PDF da seguradora — o botão **abre o PDF em uma nova aba**, pronto para enviar ao cliente.',
        '**Recotar:** dispara a cotação de novo. Use quando deu erro, quando você ajustou alguma cobertura, ou quando faltou alguma seguradora responder.',
        '**Cancelar:** encerra a OS de vez. Use quando o cliente desistiu ou a cotação foi criada por engano.',
      ] },
      { type: 'callout', variant: 'info', title: 'Botões ainda em desenvolvimento', text: 'No detalhe você também verá **Validar**, **Comparar** e **Selecionar** — eles ainda estão **em breve** (em desenvolvimento) e por enquanto só mostram um aviso.' },
      { type: 'callout', variant: 'atencao', title: 'Recotar vale a pena quando…', text: 'O status está em **Erro**, ou poucas seguradoras responderam. Recotar gera uma nova consulta a todas as seguradoras ativas — os preços anteriores são substituídos pelos novos.' },
      { type: 'callout', variant: 'perigo', title: 'Cancelar não tem volta', text: 'Uma OS **cancelada** não pode ser reaberta. Se precisar dela de novo, crie uma **Nova Cotação**. Só cancele quando tiver certeza.' },
    ],
  },

  /* ===================================================================== 05 */
  {
    id: 'apikeys', num: '05', label: 'API Keys', icon: 'key',
    kw: 'api key chave criar revogar crm integracao seguranca vazou token segredo bcrypt',
    title: 'API Keys',
    lead: 'As chaves que permitem ao CRM da corretora pedir cotações automaticamente. Trate-as como senhas.',
    blocks: [
      { type: 'p', text: 'Uma **API key** é o que deixa outro sistema — normalmente o CRM da corretora — conversar com o Hub sem ninguém precisar fazer login. Quando uma proposta entra no CRM, ele usa a chave para pedir a cotação sozinho.' },
      { type: 'h3', text: 'Quando criar uma chave' },
      { type: 'ul', items: [
        'Ao conectar um **novo sistema** ao Hub (um CRM, um site de venda, uma planilha automatizada).',
        'Para **separar ambientes**: uma chave de produção e outra de teste, para não misturar cotações reais com testes.',
        'Quando uma equipe ou parceiro precisa de acesso **com limite próprio** de requisições.',
      ] },
      { type: 'callout', variant: 'perigo', title: 'A chave aparece uma única vez', text: 'No momento em que você cria a chave, o sistema mostra o valor completo **só naquela hora**. Copie e guarde em local seguro na mesma hora — depois disso, só ficam visíveis os primeiros caracteres (ex.: `bsh_live_a93f…`). Se perder, é preciso revogar e criar outra.' },
      { type: 'h3', text: 'Criar uma chave' },
      { type: 'steps', items: [
        'Vá em **API Keys** e clique em **Nova API Key**.',
        'Dê um **nome claro** que diga para que serve (ex.: “CRM Produção”, “Integração Teste”).',
        'Defina o **limite de requisições** conforme o uso esperado.',
        'Clique em **Gerar chave**, copie o valor exibido e cole na configuração do CRM. Pronto.',
      ] },
      { type: 'shot', text: 'Modal de criação com a chave recém-gerada exibida uma única vez e o botão “Copiar” — copie agora.' },
      { type: 'h3', text: 'Como o CRM usa a chave' },
      { type: 'p', text: 'O sistema do parceiro envia a chave em cada chamada, no cabeçalho `x-api-key`. Você não precisa montar isso — quem configura o CRM faz. Fica aqui só para referência do suporte:' },
      { type: 'code', label: 'exemplo de chamada do CRM', lang: 'bash', code: `curl -X POST https://yixgolukvqbbjjkszhjg.supabase.co/functions/v1/run-quote \\
  -H "x-api-key: bsh_live_a93f...7c21" \\
  -H "Content-Type: application/json" \\
  -d '{ "placa": "JCU9D37", "cpf": "12345678900", "ramo": "auto" }'` },
      { type: 'h3', text: 'Revogar uma chave' },
      { type: 'p', text: 'Revogar **desliga a chave na hora**. Qualquer sistema que ainda a estiver usando para de funcionar imediatamente. Faça isso quando:' },
      { type: 'ul', items: [
        'A chave **vazou** ou pode ter sido vista por alguém de fora.',
        'O sistema que a usava foi **desativado**.',
        'Você trocou por uma chave nova.',
      ] },
      { type: 'callout', variant: 'atencao', text: 'Antes de revogar a chave de um CRM em produção, avise a equipe técnica do parceiro e tenha a **nova chave já configurada** — senão as cotações automáticas param até alguém perceber.' },
    ],
  },

  /* ===================================================================== 06 */
  {
    id: 'seguradoras', num: '06', label: 'Seguradoras', icon: 'shield',
    kw: 'seguradoras ligar desligar ativar taxa retorno tempo medio erros monitorar habilitar aliro allianz hdi mapfre sura tokio yelum zurich testar conexoes janela 24h 7 dias 30 dias ultimo sucesso amostra aproximacao sem dados',
    title: 'Seguradoras',
    lead: 'Quais seguradoras o Hub consulta, como ligá-las e desligá-las, e como ler a saúde de cada uma.',
    blocks: [
      { type: 'p', text: 'Na tela **Seguradoras** você decide quais delas o Hub consulta em cada cotação. Só as que estão **ligadas** recebem o pedido de preço. No piloto são **8 seguradoras**: Aliro, Allianz, HDI, Mapfre, Sura, Tokio Marine, Yelum e Zurich (a lista vem da configuração do backend).' },
      { type: 'callout', variant: 'info', title: 'Credenciais nunca ficam no painel', text: 'Login e senha de cada seguradora ficam guardados só no servidor. O painel deixa você ligar/desligar e ver a saúde, mas nunca exibe as credenciais.' },
      { type: 'h3', text: 'Ligar e desligar' },
      { type: 'p', text: 'Cada seguradora tem um interruptor. Ligado = entra nas cotações; desligado = é ignorada.' },
      { type: 'steps', items: [
        'Abra **Seguradoras**.',
        'Encontre a seguradora na lista.',
        'Clique no **interruptor** ao lado do nome para ligar ou desligar.',
      ] },
      { type: 'callout', variant: 'atencao', title: 'Desligue só com motivo', text: 'Desligue uma seguradora quando ela estiver **instável** (muitos erros) ou quando a corretora não trabalha com ela. Cada seguradora desligada é uma opção a menos de preço para o cliente.' },
      { type: 'shot', text: 'Lista de seguradoras com interruptores; uma delas aparece desligada.' },
      { type: 'callout', variant: 'info', title: 'Os números desta tela agora são reais', text: 'A **taxa de retorno**, o **tempo médio** e o **último sucesso** de cada seguradora são calculados a partir das cotações reais do período — não são mais valores de exemplo. Use o seletor **Janela** (no topo) para escolher o período: **Últimas 24h**, **7 dias** (padrão) ou **30 dias**.' },
      { type: 'h3', text: 'Interpretando a taxa de retorno' },
      { type: 'p', text: 'A **taxa de retorno** diz, de cada 100 cotações pedidas, quantas voltaram com preço. As cores no painel seguem estas faixas (não há vermelho):' },
      { type: 'table', head: ['Cor', 'Taxa de retorno', 'O que significa'], rows: [
        ['{badge:cotado|Verde}', '**≥ 90%**', 'Saudável — tudo certo.'],
        ['{badge:cotando|Azul}', '**≥ 85% e < 90%**', 'Aceitável, mas abaixo do ideal — fique de olho.'],
        ['{badge:pendente|Âmbar}', '**< 85%**', 'Baixo. Considere desligar e avise o suporte.'],
      ] },
      { type: 'callout', variant: 'atencao', title: 'A taxa de retorno é uma aproximação', text: 'O sistema só registra as cotações que **voltaram com preço** — não há registro de “a seguradora não respondeu”. Por isso a taxa é calculada sobre as **OSs concluídas no período**, assumindo que toda seguradora ligada participou de todas elas. Ela **varia conforme a amostra**: com poucas OSs no período, um único caso muda bastante o percentual, e uma seguradora **ativada há pouco** pode aparecer como **“Sem dados suficientes”**.' },
      { type: 'h3', text: 'A janela de tempo (24h / 7 / 30 dias)' },
      { type: 'p', text: 'O seletor **Janela**, no topo da tela, define o período de todas as métricas. **Últimas 24h** mostra o agora — bom para perceber se algo acabou de quebrar. **7 dias** (padrão) é o equilíbrio para o dia a dia. **30 dias** suaviza os picos e revela a tendência. Trocar a janela recarrega os números na hora.' },
      { type: 'h3', text: 'Tempo médio e último sucesso' },
      { type: 'p', text: '**Tempo médio** é quanto a seguradora demora, em segundos, entre o pedido e o retorno do preço no período (some o tempo de espera do polling). **Último sucesso** é quando ela devolveu preço pela última vez; **“Sem sucesso no período”** significa que, na janela escolhida, ela não retornou nenhuma cotação.' },
      { type: 'callout', variant: 'info', title: 'Os erros são globais, não por seguradora', text: 'O número **“erros em 24h (global)”** é o total de OSs que falharam nas últimas 24 horas — o **mesmo para todas as seguradoras**. O sistema não registra o erro por seguradora (uma OS que falha não gera uma linha por seguradora), então esse número indica a saúde **geral** da operação, não de uma seguradora específica. Para investigar caso a caso, use **Monitoring → “Erros recentes”**.' },
      { type: 'h3', text: 'Quando ficar atento' },
      { type: 'ul', items: [
        '**Taxa caindo** ao longo dos dias — compare a mesma seguradora em **7 dias** e **30 dias**; se a de 7 está bem menor, ela pode estar ficando instável.',
        '**Tempo médio subindo** muito acima das outras — ela está lenta e segurando suas cotações.',
        '**Sem sucesso recente** numa seguradora ligada e movimentada — pode ter caído; confirme nos **erros recentes** do Monitoring e avise o suporte.',
      ] },
      { type: 'h3', text: 'O que fazer se uma seguradora cair' },
      { type: 'steps', items: [
        'Confirme a queda da taxa nos **cartões desta tela** (ajuste a Janela) ou em **Monitoring → “Taxa de sucesso por seguradora”**.',
        '**Desligue** a seguradora para ela não atrapalhar as próximas cotações.',
        'Avise o **suporte** informando o nome da seguradora e desde quando caiu.',
        'Quando o suporte confirmar que normalizou, **ligue de novo**.',
      ] },
      { type: 'callout', variant: 'info', title: 'Indicador “Sessão Aggilizador”', text: 'O indicador **Sessão Aggilizador** (na barra lateral e no Monitoring) agora mostra o **estado real** da conexão com o Aggilizador: **verde** com mais de 10 min de sessão, **amarelo** quando está perto de expirar e **vermelho** se a sessão caiu. Atenção: ele reflete a conexão **global** com o Aggilizador (não uma seguradora específica) — para uma seguradora individual, continue usando os **erros recentes** no Monitoring.' },
      { type: 'p', text: 'Os botões **“Testar conexões”** (topo da tela) e a **engrenagem** de configuração de cada seguradora ainda estão **em breve** (em desenvolvimento).' },
    ],
  },

  /* ===================================================================== 07 */
  {
    id: 'monitoring', num: '07', label: 'Monitoring', icon: 'activity',
    kw: 'monitoring saude indicadores tempo medio taxa sucesso sessao aggilizador erros railway grafico cards placeholder',
    title: 'Monitoring',
    lead: 'A tela técnica que mostra, num olhar, se a operação de cotação está saudável.',
    blocks: [
      { type: 'p', text: 'Você não precisa ser técnico para usar o **Monitoring**. Pense nele como o painel do carro: se os indicadores estão verdes, está tudo bem. Quando algo fica vermelho, é hora de agir (ou avisar o suporte).' },
      { type: 'h3', text: 'Os quatro cards do topo' },
      { type: 'table', head: ['Indicador', 'Saudável', 'Atenção'], rows: [
        ['**Tempo médio de cotação**', '1–3 min é normal', 'Bem acima disso = seguradoras lentas.'],
        ['**Taxa de sucesso global**', '85% ou mais', 'Caindo = mais cotações sem preço.'],
        ['**Sessão Aggilizador**', 'Verde = sessão ativa (>10 min)', 'Amarelo = expirando; vermelho = caiu → siga o Runbook.'],
        ['**Erros (24h)**', 'Poucos / estável', 'Pulando para cima = algo quebrou.'],
      ] },
      { type: 'callout', variant: 'info', title: 'O que é a “Sessão Aggilizador” — e por que importa', text: 'Para cotar, o Hub mantém um **login ativo no Aggilizador** (a “sessão”), renovado automaticamente a cada ~55 minutos. Este card mostra o **estado real** dessa sessão: **verde** (mais de 10 min restantes), **amarelo** (1 a 10 min, prestes a renovar) e **vermelho** (expirada). O timer **“expira em”** e a **“última renovação”** vêm direto do servidor. Se o card ficar **vermelho** e as cotações começarem a falhar, é forte sinal de que a conexão caiu — confirme nos **“Erros recentes”** e siga o Runbook.' },
      { type: 'callout', variant: 'info', title: 'Por que o tempo médio não é “segundos”', text: 'O Hub espera as seguradoras responderem e devolverem os PDFs (o **polling**, de poucos segundos em poucos segundos). Por isso uma cotação saudável costuma levar **de 1 a 3 minutos** — não estranhe se não for instantâneo.' },
      { type: 'h3', text: 'Badge “Railway saudável”' },
      { type: 'p', text: 'No topo da tela há um selo que checa direto o servidor: **Railway saudável** (verde) significa que a base do sistema está no ar; **Railway indisponível** (vermelho) indica que o servidor caiu — siga o Runbook.' },
      { type: 'h3', text: 'Cotações por dia' },
      { type: 'p', text: 'O gráfico mostra o volume dos últimos 30 dias. As barras laranja são os dias mais recentes. Serve para perceber tendências: uma queda brusca de volume pode indicar que o CRM parou de enviar cotações.' },
      { type: 'h3', text: 'Taxa de sucesso por seguradora' },
      { type: 'p', text: 'Aqui ficam os números **reais** por seguradora, todas **lado a lado** — diferente dos cartões da tela Seguradoras (que ainda são exemplo). É a forma mais rápida de descobrir qual seguradora está puxando a média para baixo.' },
      { type: 'h3', text: 'Erros recentes (24h)' },
      { type: 'p', text: 'A lista das últimas falhas, com a OS afetada e o motivo. **É aqui que você descobre por que uma OS deu erro** (o detalhe da OS não mostra isso). Se o **mesmo erro se repete** em várias OS, não é coincidência — siga o Runbook e, se necessário, acione o suporte.' },
      { type: 'shot', text: 'Tela de Monitoring com os quatro cards no topo, o gráfico de barras e a lista de erros recentes.' },
    ],
  },

  /* ===================================================================== 08 */
  {
    id: 'runbook', num: '08', label: 'Runbook de Incidentes', icon: 'bolt',
    kw: 'incidente emergencia sistema fora os travada sem cotacoes sentry alerta suporte contato runbook problema sessao expirada lookup placa login painel supabase',
    title: 'Runbook de Incidentes',
    lead: 'O que fazer, na ordem, quando algo dá errado. Feito para ser seguido com calma — e para imprimir e deixar à mão.',
    blocks: [
      { type: 'callout', variant: 'dica', title: 'Imprima esta seção', text: 'Em uma emergência (sistema fora, internet instável) a tela pode não abrir. Use o botão **“Imprimir runbook”** abaixo e deixe uma cópia em papel perto da equipe.' },
      { type: 'printRunbook' },

      { type: 'h3', id: 'run-fora', text: 'Cenário 1 — O sistema está fora do ar' },
      { type: 'p', text: '**Sintoma:** o Hub não abre, ou fica girando sem carregar.' },
      { type: 'steps', items: [
        'Confirme sua **internet**: abra qualquer outro site. Se nada abre, o problema é a sua conexão.',
        'Tente **atualizar a página** ({kbd:F5}) e fazer login de novo.',
        'Abra a tela de **Monitoring** em outro computador. Se aparecer `Railway indisponível`, é o servidor — não adianta insistir.',
        'Avise o **suporte** (ver “Como contatar o suporte”) informando que o **Railway** parece fora.',
      ] },

      { type: 'h3', id: 'run-login', text: 'Cenário 2 — Não consigo entrar no painel' },
      { type: 'p', text: '**Sintoma:** a tela de login abre, mas o e-mail/senha não entram — ou dá “credenciais inválidas” mesmo com a senha certa.' },
      { type: 'steps', items: [
        'Confira **e-mail e senha** (a senha diferencia maiúsculas de minúsculas).',
        'Veja se é só com você: peça a um colega para tentar entrar. Se **ninguém** entra, pode ser o **Supabase** (o login do sistema) fora do ar.',
        'Se você esqueceu a senha, clique em **Esqueci a senha** e fale com o administrador para redefinir (ver **Acesso ao Painel**).',
        'Se ninguém consegue entrar, **acione o suporte** informando que o login (Supabase) parece fora.',
      ] },

      { type: 'h3', id: 'run-travada', text: 'Cenário 3 — Uma OS travou em “Cotando”' },
      { type: 'p', text: '**Sintoma:** uma OS fica em {badge:cotando|Cotando} por bem mais que 3 minutos.' },
      { type: 'steps', items: [
        'Abra a OS e clique em **Recotar**. Na maioria das vezes isso resolve.',
        'Se quiser entender o que houve, veja **Monitoring → “Erros recentes”** (o detalhe da OS não mostra o motivo).',
        'Se **várias** OS estão travando ao mesmo tempo, vá ao Cenário 4.',
      ] },

      { type: 'h3', id: 'run-sem', text: 'Cenário 4 — Nenhuma cotação está voltando' },
      { type: 'p', text: '**Sintoma:** várias OS recentes entram em {badge:erro|Erro} ou ficam sem preço.' },
      { type: 'callout', variant: 'info', title: 'Olhe o card “Sessão Aggilizador”', text: 'Ele agora mostra o **estado real** da conexão: se estiver **vermelho** (expirada), é forte sinal de que a sessão caiu. Confirme nos **“Erros recentes”** e acione o suporte.' },
      { type: 'steps', items: [
        'Vá ao **Monitoring → “Erros recentes”** e veja se a **mesma mensagem se repete** (ex.: algo sobre sessão/login do Aggilizador).',
        'A conexão com o Aggilizador **precisa ser religada pela equipe técnica** — você não faz isso pelo painel. Acione o suporte com urgência.',
        'Enquanto isso, avise os operadores para **não criarem novas cotações em massa** — elas só vão se acumular em erro.',
      ] },
      { type: 'callout', variant: 'perigo', title: 'Isto é um incidente crítico', text: 'Sem a conexão com o Aggilizador, **nenhuma cotação funciona**. Trate com prioridade máxima e comunique o suporte imediatamente.' },

      { type: 'h3', id: 'run-lookup', text: 'Cenário 5 — O lookup de placa não retorna ou está lento' },
      { type: 'p', text: '**Sintoma:** em Nova Cotação, **Buscar placa** não preenche os dados, demora muito, ou diz “placa não encontrada” para placas que existem.' },
      { type: 'steps', items: [
        'Tente de novo após alguns segundos — pode ser lentidão momentânea da consulta de placa.',
        'Se for **placa nova / recém-emplacada**, ela pode ainda não constar na base: preencha **modelo, ano e código FIPE** na mão (ver **Criando Cotações**).',
        'Se o lookup falhar para **várias placas diferentes**, a consulta de placa pode estar instável — avise o suporte.',
      ] },
      { type: 'callout', variant: 'dica', text: 'O lookup é uma conveniência; a cotação **não depende** dele. Com modelo e **código FIPE** corretos preenchidos à mão, a OS cota normalmente.' },

      { type: 'h3', id: 'run-sessao', text: 'Cenário 6 — Sessão do Aggilizador expirada' },
      { type: 'p', text: '**Sintoma:** cotações novas caem em erro com mensagem de “sessão expirada” nos **Erros recentes**, ou nada volta há vários minutos.' },
      { type: 'steps', items: [
        'Confirme em **Monitoring → “Erros recentes”** que a mensagem fala em sessão/login do Aggilizador. O card **“Sessão Aggilizador”** ajuda no diagnóstico: se estiver **vermelho (expirada)**, reforça que a sessão caiu.',
        'O Hub tenta religar a sessão sozinho (ele guarda a sessão por ~55min e refaz o login quando expira). Aguarde 1–2 minutos e recote **uma** OS de teste.',
        'Se continuar falhando, **acione o suporte** — só a equipe técnica religa a sessão no servidor (inclusive quando o Aggilizador está com “sessões lotadas”).',
        'Evite recotar tudo em massa antes da sessão voltar.',
      ] },

      { type: 'h3', id: 'run-sentry', text: 'Cenário 7 — Chegou um alerta do Sentry' },
      { type: 'p', text: 'O **Sentry** envia avisos automáticos de erro à equipe técnica. Esses erros vêm do **backend no Railway** (não das Edge Functions), identificados por uma tag `component`: normalmente **`quote-worker`** (o processo que roda a cotação) ou **`aggilizador`** (a chamada às seguradoras).' },
      { type: 'code', label: 'exemplo de alerta do Sentry', lang: 'text', code: `[BemSeguro Hub] Erro capturado
  component: aggilizador
  operation: calcularV2
  message: calcularV2 HTTP 503 (após 3 tentativas)
  time: 2026-06-02 14:22 BRT` },
      { type: 'p', text: 'Se alguém repassar um alerta para você, anote três coisas e mande ao suporte: **qual `component`** (aqui, `aggilizador`), **qual OS** foi afetada (quando houver) e **o horário**. Isso acelera muito o atendimento.' },

      { type: 'h3', id: 'run-suporte', text: 'Como contatar o suporte' },
      { type: 'p', text: 'Quando precisar acionar o suporte, mande tudo de uma vez para evitar idas e vindas:' },
      { type: 'ul', items: [
        '**O que aconteceu:** uma frase (“nenhuma cotação volta desde 14h”).',
        '**Desde quando** e se está piorando.',
        '**Número da OS** afetada, se houver.',
        '**Print da tela** de Monitoring ou do erro.',
      ] },
      { type: 'callout', variant: 'info', title: 'Contato do suporte (piloto)', text: '**Guilherme Avila** — `(55) 9 8100-0000`. Use para incidentes críticos (sistema fora, nenhuma cotação volta).' },
      { type: 'p', text: 'Após o handoff do piloto, o suporte passará a ser feito por **Rodrigo**, da Bem Seguro.' },
    ],
  },

  /* ===================================================================== 09 */
  {
    id: 'faq', num: '09', label: 'Perguntas Frequentes', icon: 'help',
    kw: 'faq perguntas frequentes duvidas comuns demora preco diferente pdf placa nao encontrada cancelar cpf editar placeholder numeros',
    title: 'Perguntas Frequentes',
    lead: 'As dúvidas que mais aparecem no dia a dia da operação.',
    blocks: [
      { type: 'faq', items: [
        { q: 'Por que às vezes voltam poucas cotações?', a: 'Cada seguradora responde no seu tempo e algumas podem dar timeout, estar **desligadas** ou não cobrir aquele perfil/veículo. Se faltar muita, **recote**. Se uma some sempre, cheque a saúde dela em **Monitoring → “Taxa de sucesso por seguradora”**.' },
        { q: 'Posso editar uma OS depois de criada?', a: 'Não dá para editar os dados de uma OS já criada. O caminho é **recotar** (para ajustar coberturas e disparar de novo) ou, se os dados estavam errados, **cancelar** e criar uma **Nova Cotação** com as informações corretas.' },
        { q: 'O que faço com um cliente que não tem CPF na base?', a: 'O CPF é obrigatório para cotar. Peça o CPF ao cliente e informe no formulário de **Nova Cotação**. Sem um CPF válido a cotação não é enviada às seguradoras.' },
        { q: 'Uma cotação demora para sair. É normal?', a: 'Normalmente leva de **1 a 3 minutos** — o Hub espera as seguradoras responderem (o **polling**). Se passar bem disso em “Cotando”, siga o Cenário 3 do Runbook e clique em **Recotar**.' },
        { q: 'O preço veio diferente do que o cliente esperava. Por quê?', a: 'O prêmio depende de muitos fatores: CEP de pernoite, idade e perfil do condutor, classe de bônus, coberturas e o código FIPE exato do veículo. Confira se a **placa/FIPE** e o **CEP** estão certos — um deles errado muda bastante o valor.' },
        { q: 'Como funcionam os PDFs das seguradoras?', a: 'Cada preço que volta com proposta completa traz um **PDF** da seguradora; o botão **abre o PDF em uma nova aba**, pronto para enviar ao cliente. Se a seguradora retornou só o valor (sem proposta) ou deu erro, não há PDF — tente **recotar** aquela OS.' },
        { q: 'A placa não foi encontrada no lookup. E agora?', a: 'Acontece com carros muito novos. Preencha **marca, modelo, ano e código FIPE** manualmente. O código FIPE é o mais importante — sem ele certo, o preço sai errado.' },
        { q: 'Cancelei uma OS por engano. Como recupero?', a: 'Não dá para reabrir uma OS cancelada. É só criar uma **Nova Cotação** com os mesmos dados — o lookup de placa torna isso rápido.' },
        { q: 'Cliquei duas vezes em “Criar OS”. Criou duas?', a: 'Não. O painel manda uma **Idempotency-Key** única por formulário, então cliques repetidos viram **uma só OS**. Pode ficar tranquilo.' },
        { q: 'A taxa de retorno de uma seguradora mudou de um dia para o outro. É bug?', a: 'Provavelmente **não**. A taxa é uma **aproximação** calculada sobre as OSs cotadas no período selecionado na **Janela** (24h / 7 / 30 dias), então **varia conforme a amostra** — com poucas OSs, um único caso muda bastante o percentual. Compare janelas maiores (30 dias) para ver a tendência. Veja **Seguradoras → “Quando ficar atento”**.' },
        { q: 'O sistema travou bem na hora de atender o cliente.', a: 'Respire. Atualize a página ({kbd:F5}) e tente de novo. Se não voltar, abra o Hub em outro computador e siga o **Runbook de Incidentes**. Para o cliente, anote os dados em papel e crie a cotação assim que o sistema voltar.' },
      ] },
      { type: 'callout', variant: 'dica', title: 'Não achou sua dúvida?', text: 'Use a **busca** no topo do índice à esquerda, ou fale com o suporte (ver Runbook → “Como contatar o suporte”). Se for algo recorrente, avise — a gente adiciona aqui.' },
    ],
  },
];
