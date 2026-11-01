function texttomodel:start_color
$data modify storage texttomodel:play text set value "$(text)"
$data modify storage texttomodel:play font set value "$(font)"
function texttomodel:hex/print with storage texttomodel:play
