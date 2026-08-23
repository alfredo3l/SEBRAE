SELECT FIELDS(ALL) FROM Contact WHERE CPF__c = '{{ $('CPF').item.json.cpf }}' LIMIT 200
