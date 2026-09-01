# Aula 01 — Limites

## Definição intuitiva

O limite de uma função f(x) quando x se aproxima de um valor "a" descreve o
comportamento de f perto de "a" — não necessariamente o valor de f em "a".
Notação: lim(x→a) f(x) = L.

Exemplo trabalhado em aula: f(x) = (x² - 1)/(x - 1) não está definida em x = 1,
mas lim(x→1) f(x) = 2, porque para x perto de 1 (mas diferente de 1),
f(x) = x + 1.

## Limites laterais

- Limite pela esquerda: x → a⁻
- Limite pela direita: x → a⁺

O limite lim(x→a) f(x) só existe se os dois limites laterais existirem e forem
iguais. Se forem diferentes, dizemos que o limite não existe nesse ponto.

Isso é especialmente importante em funções definidas por partes.

## Propriedades operatórias

Se lim(x→a) f(x) e lim(x→a) g(x) existem, então:

- lim (f + g) = lim f + lim g
- lim (f · g) = lim f · lim g
- lim (f / g) = lim f / lim g, desde que lim g ≠ 0

Quando surge uma indeterminação do tipo 0/0, o primeiro passo é sempre tentar
fatorar ou racionalizar a expressão antes de aplicar as propriedades acima.

## Limites no infinito

Quando x cresce ou decresce sem limite, o comportamento de f(x) costuma se
estabilizar em torno de uma assíntota horizontal. Para funções racionais,
comparamos o grau do numerador com o grau do denominador.

Esse assunto será retomado quando estudarmos continuidade de funções racionais
na próxima aula.
