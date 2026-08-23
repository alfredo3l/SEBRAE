<!-- NOTA: export de fluxo n8n de EXEMPLO (obtenção de dados pessoais do Contact e nº da
     interação/Case no FOCO). As credenciais de produção foram REDIGIDAS em 22/08/2026 —
     os valores reais vivem no .env / instância n8n, nunca neste repositório. -->
{
  "nodes": [
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "996a6d0f-30eb-452e-8400-c2ab64c02e39",
              "name": "Client Id",
              "value": "<<<REDACTED-FOCO-PROD-CLIENT-ID>>>",
              "type": "string"
            },
            {
              "id": "3f630a02-68bf-45f6-bef1-8cb2458a0779",
              "name": "=Client Secret",
              "value": "<<<REDACTED-FOCO-PROD-CLIENT-SECRET>>>",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        -1072,
        1328
      ],
      "id": "14134aca-08df-40ad-9edb-c198ee1b7455",
      "name": "credenciais-PRODUCAO1"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://gateway.sebrae.com.br/foco/services/oauth2/token",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "grant_type",
              "value": "client_credentials"
            },
            {
              "name": "client_id",
              "value": "={{ $json[\"Client Id\"] }}"
            },
            {
              "name": "client_secret",
              "value": "={{ $json[\"Client Secret\"] }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.3,
      "position": [
        -832,
        1328
      ],
      "id": "ce96c9bf-5a43-4bf3-b664-fa46446e6ff5",
      "name": "HTTP Request--1"
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "21b80a7b-94e2-4418-9c92-5f24ec6bad47",
              "name": "access_token",
              "value": "={{ $json.access_token }}",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        -560,
        1328
      ],
      "id": "b2bd9104-ad79-4b52-bdf4-e8a0b0eb1c6f",
      "name": "acess_token--1"
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "d143430e-0fdd-457f-a8cc-fc01eec6fa30",
              "name": "records[0].Id",
              "value": "={{ $json.records[0].Id }}",
              "type": "string"
            },
            {
              "id": "54d412ac-ea87-4800-b874-ea01153d2e22",
              "name": "records[0].AccountId",
              "value": "={{ $json.records[0].AccountId }}",
              "type": "string"
            },
            {
              "id": "cb9cc98e-f155-4c40-a359-e7ac91622897",
              "name": "records[0].Name",
              "value": "={{ $json.records[0].Name }}",
              "type": "string"
            },
            {
              "id": "c8533f93-83bf-4ed0-9d18-d201548a9352",
              "name": "records[0].MailingCity",
              "value": "={{ $json.records[0].MailingCity }}",
              "type": "string"
            },
            {
              "id": "0cee2f96-3419-4716-ac90-d02200a185ab",
              "name": "records[0].MailingState",
              "value": "={{ $json.records[0].MailingState }}",
              "type": "string"
            },
            {
              "id": "559f20cb-54fc-4342-9b70-fb6c6f7e27e1",
              "name": "records[0].MailingLatitude",
              "value": "={{ $json.records[0].MailingLatitude }}",
              "type": "number"
            },
            {
              "id": "7967896d-4cd8-4505-b226-3c235c18a00f",
              "name": "records[0].MailingLongitude",
              "value": "={{ $json.records[0].MailingLongitude }}",
              "type": "number"
            },
            {
              "id": "062591fe-a5b7-4f4a-aa0b-e0954ab304ef",
              "name": "records[0].Phone",
              "value": "={{ $json.records[0].Phone }}",
              "type": "string"
            },
            {
              "id": "25221f35-c7b8-4b75-829f-103d88f02a0e",
              "name": "records[0].Email",
              "value": "={{ $json.records[0].Email }}",
              "type": "string"
            },
            {
              "id": "649294fd-bfe7-46d1-a132-5b3e40f9ab91",
              "name": "records[0].PhotoUrl",
              "value": "={{ $json.records[0].PhotoUrl }}",
              "type": "string"
            },
            {
              "id": "6fe4d3c6-bbe2-48bb-a814-74aff6828df0",
              "name": "records[0].CPF__c",
              "value": "={{ $json.records[0].CPF__c }}",
              "type": "string"
            },
            {
              "id": "157c6a01-8b5d-4bcc-8312-3ead815e8616",
              "name": "records[0].Escolaridade__c",
              "value": "={{ $json.records[0].Escolaridade__c }}",
              "type": "string"
            },
            {
              "id": "8496ae45-f7e7-4cbe-b3da-90caef1e1b2d",
              "name": "records[0].TermoAceiteLGPD__c",
              "value": "={{ $json.records[0].TermoAceiteLGPD__c }}",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        240,
        1328
      ],
      "id": "7759bc86-20c5-4ca7-a9d6-4e5a197a6331",
      "name": "Output-PRODUCAO1"
    },
    {
      "parameters": {
        "url": "=https://gateway.sebrae.com.br/foco/services/data/v64.0/query",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "q",
              "value": "=SELECT Id, Name, CPF__c, Phone, MobilePhone, Email, AccountId, Account.Name FROM Contact WHERE CPF__c = '025.570.401-18' LIMIT 1\n\n"
            }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $json.access_token }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.3,
      "position": [
        -320,
        1328
      ],
      "id": "5a47ceb0-d1f7-4ca3-84d4-ddc39a146c9d",
      "name": "Obtendo dados Pessoais"
    },
    {
      "parameters": {
        "url": "=https://gateway.sebrae.com.br/foco/services/data/v64.0/query",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "q",
              "value": "=SELECT Id, CaseNumber, Status, CreatedDate, HoraInicio__c, HoraFinal__c, Description FROM Case WHERE ContactId IN (SELECT Id FROM Contact WHERE CPF__c = '025.570.401-18') ORDER BY CreatedDate DESC LIMIT 1\n\n\n"
            }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $('acess_token--1').item.json.access_token }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.3,
      "position": [
        -32,
        1328
      ],
      "id": "f62435e2-9fb7-4bc5-9ba7-4e4b5b0ac51e",
      "name": "Obtendo Numero da Integração"
    }
  ],
  "connections": {
    "credenciais-PRODUCAO1": {
      "main": [
        [
          {
            "node": "HTTP Request--1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "HTTP Request--1": {
      "main": [
        [
          {
            "node": "acess_token--1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "acess_token--1": {
      "main": [
        [
          {
            "node": "Obtendo dados Pessoais",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Obtendo dados Pessoais": {
      "main": [
        [
          {
            "node": "Obtendo Numero da Integração",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Obtendo Numero da Integração": {
      "main": [
        [
          {
            "node": "Output-PRODUCAO1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "df3c5ee72646603a46038a8bf98cfe3d0def4c308b534bfb5be70fd76c8f0bb6"
  }
}