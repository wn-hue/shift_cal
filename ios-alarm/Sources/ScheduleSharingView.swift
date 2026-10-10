import SwiftUI

struct GroupSelectionView: View {
    @ObservedObject var store: ScheduleStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("내 교대조") {
                    ForEach(["A","B","C"],id:\.self) { group in
                        Button { store.setGroup(group); dismiss() } label: {
                            HStack {
                                VStack(alignment:.leading,spacing:6) {
                                    Text(group+"조").font(.headline)
                                    Text("오늘 기본 · "+store.engine.day(Date(),group:group).label).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if store.group==group { Image(systemName:"checkmark.circle.fill").foregroundStyle(.indigo) }
                            }.padding(.vertical,8).foregroundStyle(.primary)
                        }.accessibilityIdentifier("group-"+group)
                    }
                }
                Section { Text("조별 근무 변경과 메모는 각각 유지됩니다. 선택한 조의 근무표로 알람을 사용 중이면 예약도 갱신됩니다.").font(.footnote) }
            }.navigationTitle("조 변경").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("닫기") { dismiss() } } }
        }.presentationDetents([.medium,.large]).presentationDragIndicator(.visible)
    }
}

enum ScheduleDisplay {
    static func title(_ date:Date,format:String)->String {
        let f=DateFormatter(); f.locale=Locale(identifier:"ko_KR"); f.timeZone=ShiftPlanner.korea.timeZone; f.dateFormat=format
        return f.string(from:date)
    }
}

struct MonthGrid: View {
    let days:[WorkDay]
    let showMemos:Bool
    var onSelect:((WorkDay)->Void)? = nil
    private let columns=Array(repeating:GridItem(.flexible(),spacing:4),count:7)
    var body: some View {
        let pad=ShiftPlanner.korea.component(.weekday,from:days[0].date)-1
        LazyVGrid(columns:columns,spacing:6) {
            ForEach(Array(["일","월","화","수","목","금","토"].enumerated()),id:\.offset) { i,name in
                Text(name).font(.caption.weight(.semibold)).foregroundStyle(i==0 ? Color.red : i==6 ? Color.blue : Color.secondary).frame(maxWidth:.infinity)
            }
            ForEach(0..<pad,id:\.self) { _ in Color.clear.frame(height:82) }
            ForEach(days) { day in
                Button { onSelect?(day) } label: {
                    VStack(spacing:4) {
                        Text(String(ShiftPlanner.korea.component(.day,from:day.date))).font(.subheadline.weight(.semibold))
                            .foregroundStyle(day.holiday.isEmpty ? Color.primary : .red)
                        VStack(spacing:3) {
                            Image(systemName:day.type.symbol).font(.system(size:10))
                            Text(day.type == .noOT ? "OT해제" : day.type.label).font(.system(size:10,weight:.bold)).minimumScaleFactor(0.65).lineLimit(1)
                        }.foregroundStyle(day.type.color).frame(maxWidth:.infinity).padding(.vertical,5)
                            .background(day.type.color.opacity(0.13),in:RoundedRectangle(cornerRadius:9))
                        HStack(spacing:3) {
                            if day.changed { Image(systemName:"pencil").font(.system(size:8)) }
                            if showMemos && !day.memo.isEmpty { Circle().frame(width:4,height:4) }
                            if !day.holiday.isEmpty { Image(systemName:"flag.fill").font(.system(size:8)).foregroundStyle(.red) }
                        }.frame(height:7).foregroundStyle(.secondary)
                    }.padding(.horizontal,3).frame(maxWidth:.infinity,minHeight:82)
                        .background(Color(.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:12))
                        .overlay(RoundedRectangle(cornerRadius:12).stroke(ShiftPlanner.korea.isDateInToday(day.date) ? Color.indigo : .clear,lineWidth:2))
                }.buttonStyle(.plain).accessibilityLabel("\(day.key) \(day.label) \(day.holiday) \(showMemos ? day.memo : "")")
                    .accessibilityIdentifier("day-\(day.key)")
            }
        }
    }
}

struct ScheduleShareView: View {
    @ObservedObject var store:ScheduleStore
    @Binding var month:Date
    @State private var includeMemos=false
    @State private var preview:SharePreview?
    @State private var fileURL:URL?
    @State private var message=""
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    VStack(alignment:.leading,spacing:8) {
                        Text("내 근무표 보내기").font(.title2.bold())
                        Text("동료나 가족에게 필요한 일정만 공유하세요.").foregroundStyle(.secondary)
                    }
                    HStack {
                        Button { move(-1) } label:{ Image(systemName:"chevron.left").frame(width:44,height:44) }.accessibilityLabel("이전 달")
                        Spacer()
                        VStack(spacing:4) { Text(ScheduleDisplay.title(month,format:"yyyy년 M월")).font(.headline); Text(store.group+"조").foregroundStyle(.secondary) }
                        Spacer()
                        Button { move(1) } label:{ Image(systemName:"chevron.right").frame(width:44,height:44) }.accessibilityLabel("다음 달")
                    }
                    Toggle("메모도 함께 보내기",isOn:$includeMemos)
                    Text("기본은 메모 제외입니다. 선택한 조의 이번 달 근무만 공유합니다.").font(.footnote).foregroundStyle(.secondary)
                    Button { makeImage() } label: { shareCard("이미지로 보내기",detail:"월간 근무표를 한 장의 이미지로",symbol:"photo.on.rectangle.angled") }.buttonStyle(.plain).accessibilityIdentifier("share-image")
                    Button { makeCalendar() } label: { shareCard("캘린더 파일로 보내기",detail:"받는 사람이 캘린더에 가져올 수 있어요",symbol:"calendar.badge.plus") }.buttonStyle(.plain).accessibilityIdentifier("share-calendar")
                    Text("공유한 사본에는 이후 수정이 자동 반영되지 않습니다.").font(.footnote).foregroundStyle(.secondary)
                    if !message.isEmpty { Text(message).foregroundStyle(.red).accessibilityIdentifier("share-error") }
                }.padding()
            }.background(Color(.systemGroupedBackground)).navigationTitle("공유")
            .sheet(item:$preview) { item in
                NavigationStack {
                    ScrollView { Image(uiImage:item.image).resizable().scaledToFit().padding().accessibilityIdentifier("share-preview") }
                        .navigationTitle("공유 이미지 확인").navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement:.cancellationAction) { Button("닫기") { preview=nil } }
                            ToolbarItem(placement:.confirmationAction) { ShareLink(item:item.url) { Label("보내기",systemImage:"square.and.arrow.up") } }
                        }
                }
            }
            .sheet(isPresented:Binding(get:{fileURL != nil},set:{if !$0 {fileURL=nil}})) { if let fileURL { ShareSheet(items:[fileURL]) } }
        }
    }
    private func shareCard(_ title:String,detail:String,symbol:String)->some View {
        HStack(spacing:16) {
            Image(systemName:symbol).font(.title2).foregroundStyle(.indigo).frame(width:48,height:48).background(Color.indigo.opacity(0.1),in:RoundedRectangle(cornerRadius:14))
            VStack(alignment:.leading,spacing:6) { Text(title).font(.headline);Text(detail).font(.subheadline).foregroundStyle(.secondary) }
            Spacer();Image(systemName:"chevron.right").foregroundStyle(.secondary)
        }.padding(20).background(.background,in:RoundedRectangle(cornerRadius:22)).foregroundStyle(.primary)
    }
    private func move(_ delta:Int) { month=ShiftPlanner.korea.date(byAdding:.month,value:delta,to:month)! }
    @MainActor private func makeImage() {
        message=""
        let content=SharedScheduleImage(days:store.month(month),group:store.group,month:month,includeMemos:includeMemos)
        let renderer=ImageRenderer(content:content.environment(\.colorScheme,.light));renderer.scale=3
        guard let image=renderer.uiImage,let data=image.pngData() else { message="이미지를 만들지 못했습니다. 다시 시도해 주세요.";return }
        do {
            let url=FileManager.default.temporaryDirectory.appendingPathComponent("Shift_cal_\(store.group)_\(ScheduleEngine.key(month).prefix(7)).png")
            try data.write(to:url,options:.atomic);preview=SharePreview(image:image,url:url)
        } catch { message="이미지 저장 실패: \(error.localizedDescription)" }
    }
    private func makeCalendar() {
        message=""
        do {
            let url=FileManager.default.temporaryDirectory.appendingPathComponent("Shift_cal_\(store.group)_\(ScheduleEngine.key(month).prefix(7)).ics")
            try store.calendarText(for:month,includeMemos:includeMemos).write(to:url,atomically:true,encoding:.utf8);fileURL=url
        } catch { message="파일 생성 실패: \(error.localizedDescription)" }
    }
}

struct SharePreview:Identifiable { let id=UUID();let image:UIImage;let url:URL }
struct SharedScheduleImage:View {
    let days:[WorkDay]
    let group:String
    let month:Date
    let includeMemos:Bool
    var body:some View {
        VStack(alignment:.leading,spacing:20) {
            HStack { VStack(alignment:.leading,spacing:5) { Text("Shift_cal").font(.headline).foregroundStyle(.indigo);Text(ScheduleDisplay.title(month,format:"yyyy년 M월")).font(.title2.bold()) };Spacer();Text(group+"조").font(.title2.bold()) }
            MonthGrid(days:days,showMemos:includeMemos)
            HStack { Label("주간",systemImage:"sun.max.fill");Label("야간",systemImage:"moon.fill");Label("휴무",systemImage:"cup.and.saucer.fill") }.font(.caption).foregroundStyle(.secondary)
            if includeMemos {
                ForEach(days.filter{ !$0.memo.isEmpty }) { day in Text("\(ShiftPlanner.korea.component(.day,from:day.date))일 · \(day.memo)").font(.subheadline) }
            }
            Text("공유한 시점의 근무표 · 변경 시 다시 확인해 주세요").font(.caption).foregroundStyle(.secondary)
        }.padding(24).frame(width:420).background(Color(.systemGroupedBackground))
    }
}
