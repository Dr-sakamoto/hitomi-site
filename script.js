//updateClockの定義、はじまりのサイン
function updateClock() 

{
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');

    const text = `${h}:${m}:${s}`;
    document.getElementById("clock").textContent = text;
}
//一秒（1000m秒）感覚でupdateClockを実行
setInterval(updateClock, 1000);

//updateClockの終わりサイン
updateClock();
