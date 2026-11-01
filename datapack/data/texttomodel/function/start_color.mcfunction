execute store result score #tick texttomodel run time query gametime
# 패킷 지연으로 시작 틱이 클라이언트 시각보다 미래가 되면 셰이더가 약 20분 경과로 읽어 마지막 프레임이 번쩍인다.
scoreboard players operation #tick texttomodel -= #lead texttomodel
scoreboard players operation #tick texttomodel %= #cycle texttomodel
scoreboard players operation #high texttomodel = #tick texttomodel
scoreboard players operation #high texttomodel /= #byte texttomodel
scoreboard players operation #tick texttomodel %= #byte texttomodel
execute store result storage texttomodel:play high int 1 run scoreboard players get #high texttomodel
execute store result storage texttomodel:play low int 1 run scoreboard players get #tick texttomodel
function texttomodel:hex/lookup with storage texttomodel:play
function texttomodel:hex/join with storage texttomodel:play
