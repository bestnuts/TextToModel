function texttomodel:start_color
$data modify storage texttomodel:play text set value "$(text)"
$data modify storage texttomodel:play font set value "$(font)"
function texttomodel:hex/tellraw with storage texttomodel:play
