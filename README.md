# TextToModel

이 프로젝트 핵심은 모델을 텍스트 글리프 한 장에 데이터로 저장하고, 텍스트 셰이더가 데이터를 읽어 3D로 그리는 것이다.

## 왜 텍스트인가?

모드 셰이더팩은 월드 렌더링을 교체하지만 GUI 텍스트 렌더링은 교체하지 않습니다. 그래서 GUI 텍스트에서 모델을 그리면 셰이더팩을 켜도 함께 동작합니다.

## 애니메이션 제어

텍스트 색상을 파라미터로 설정하고 애니메이션을 제어합니다.
아래 표는 16진수로 값을 표현했습니다.
| R | GGBB | 동작 | 색 염색 |
| --- | --- | --- | --- |
| `80` | 시작 틱 | 그 시각부터 재생 | 안 됨 |
| `C0` | 프레임 번호 | 그 프레임에 정지 | 안 됨 |
| 그 외 | 무시 | 자동 루프 | 됨 |

시작 프레임을 만드는 방법은 이러합니다.
1. /time query gametime 명령어를 통해 world age를 알아냅니다.
2. 알아낸 값을 24000으로 나눈 나머지를 16진수로 변환합니다.
3. 변환된 16진수를 조합해 색상으로 만들고 사용합니다.
---
1. /time query gametime = 123456
2. 123456 % 24000 = 3456 = 0x0D80
3. #800D80

### 데이터팩으로 계산하기

26.3 전용 `datapack` 폴더를 월드의 `datapacks` 폴더에 넣으면 위 계산을 명령어로 할 수 있습니다.
지연으로 마지막 프레임이 번쩍이지 않도록 현재 시각보다 2틱 앞선 값을 씁니다.

| 함수 | 동작 |
| --- | --- |
| `texttomodel:title_color` | 지금 시작하는 색을 입힌 텍스트를 실행자의 타이틀에 출력 |
| `texttomodel:tellraw_color` | 지금 시작하는 색을 입힌 텍스트를 실행자의 채팅에 출력 |
| `texttomodel:start_color` | 출력 없이 저장소 `texttomodel:play`의 `color`에 기록 |

`title_color`와 `tellraw_color`는 출력할 글리프와 폰트를 함께 받습니다. 계산된 색은 `/data get storage texttomodel:play color`로 확인합니다.

```mcfunction
/function texttomodel:title_color {text:"\uE020",font:"texttomodel:sample"}
```

다른 함수에서 쓸 때는 매크로로 색을 넘깁니다.

```mcfunction
# mypack:play
function texttomodel:start_color
function mypack:show with storage texttomodel:play

# mypack:show
$title @a title {text:"\uE020",font:"texttomodel:sample",color:"$(color)"}
```

## 주의사항

텍스트이므로 italic과 bold를 사용하는 경우가 있습니다. 이를 사용하는 경우 의도한 렌더링을 보장하지 않습니다.
시작 틱은 24000틱(20분) 주기로 다시 돌아오므로, 같은 색을 계속 띄워 두면 20분마다 처음부터 재생됩니다.
블록벤치에서 내보내는 대상은 Generic Model의 큐브입니다. 메시는 사용하지 않습니다.