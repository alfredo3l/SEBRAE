SELECT FIELDS(ALL) FROM Contact WHERE CPF__c = '{{ $('seta_Dados').item.json.CPF }}' LIMIT 200
