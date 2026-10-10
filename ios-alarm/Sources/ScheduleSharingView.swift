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
                                if store.group==group { Image(systemName:"checkmark.circle.fill").foregroundStyle(WorkType.night.color) }
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
    var cellHeight:CGFloat = 90
    var onSelect:((WorkDay)->Void)? = nil
    private let columns=Array(repeating:GridItem(.flexible(),spacing:0),count:7)
    var body: some View {
        let pad=ShiftPlanner.korea.component(.weekday,from:days[0].date)-1
        let total=((pad+days.count+6)/7)*7
        LazyVGrid(columns:columns,spacing:0) {
            ForEach(Array(["일","월","화","수","목","금","토"].enumerated()),id:\.offset) { i,name in
                Text(name).font(.system(size:11)).foregroundStyle(i==0 ? Color.red : i==6 ? Color.blue : Color.secondary).frame(maxWidth:.infinity).frame(height:28)
            }
            ForEach(0..<total,id:\.self) { position in
                if position>=pad && position<pad+days.count {
                    let day=days[position-pad]
                    Button { onSelect?(day) } label: {
                        VStack(alignment:.leading,spacing:10) {
                            HStack(alignment:.top,spacing:2) {
                                Text(String(ShiftPlanner.korea.component(.day,from:day.date))).font(.system(size:12,weight:.medium))
                                    .foregroundStyle(!day.holiday.isEmpty || position%7==0 ? Color.red : position%7==6 ? Color.blue : .primary)
                                Spacer(minLength:0)
                                if !day.holiday.isEmpty { Text(day.holiday).font(.system(size:7)).foregroundStyle(.red).lineLimit(1) }
                            }
                            Text(day.type.shortLabel).font(.system(size:12,weight:.medium)).foregroundStyle(day.type==WorkType.off ? day.type.color : day.type.badgeTextColor)
                                .frame(width:30,height:27)
                                .background(day.type==WorkType.off ? Color.clear : day.type.color,in:RoundedRectangle(cornerRadius:7))
                                .frame(maxWidth:.infinity)
                            HStack(spacing:3) {
                                if day.changed { Image(systemName:"pencil").font(.system(size:7)) }
                                if showMemos && !day.memo.isEmpty { Circle().frame(width:3,height:3) }
                            }.foregroundStyle(.secondary).frame(maxWidth:.infinity).frame(height:4)
                            Spacer(minLength:0)
                        }.padding(.horizontal,4).padding(.top,7).frame(maxWidth:.infinity).frame(height:cellHeight)
                            .background(ShiftPlanner.korea.isDateInToday(day.date) ? WorkType.night.color.opacity(0.035) : .clear)
                            .overlay(Rectangle().stroke(ShiftPlanner.korea.isDateInToday(day.date) ? WorkType.night.color.opacity(0.7) : .clear,lineWidth:1))
                            .overlay(alignment:.bottom) { Rectangle().fill(Color.primary.opacity(0.09)).frame(height:0.5) }
                            .overlay(alignment:.trailing) { Rectangle().fill(Color.primary.opacity(0.07)).frame(width:0.5) }
                    }.buttonStyle(.plain).accessibilityLabel("\(day.key) \(day.label) \(day.holiday) \(showMemos ? day.memo : "")")
                        .accessibilityIdentifier("day-\(day.key)")
                } else {
                    Color.clear.frame(height:cellHeight)
                        .overlay(alignment:.bottom) { Rectangle().fill(Color.primary.opacity(0.09)).frame(height:0.5) }
                        .overlay(alignment:.trailing) { Rectangle().fill(Color.primary.opacity(0.07)).frame(width:0.5) }
                }
            }
        }
    }
}

struct ScheduleShareView: View {
    @ObservedObject var store:ScheduleStore
    @Binding var month:Date
    @State private var includeMemos=false
    @State private var preview:SharePreview?
    @State private var linkURL:URL?
    @State private var fileURL:URL?
    @State private var message=""
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    VStack(alignment:.leading,spacing:8) {
                        Text("근무표 보내기").font(.title2.weight(.semibold))
                        Text("이미지나 파일로 간편하게 공유하세요.").font(.subheadline).foregroundStyle(.secondary)
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
                    Button { makeLink() } label: { shareCard("링크로 보내기",detail:"공유 시점의 이번 달 근무 · 메모 제외",symbol:"link") }.buttonStyle(.plain)
                    Divider()
                    Button { makeImage() } label: { shareCard("이미지로 보내기",detail:"월간 근무표를 한 장의 이미지로",symbol:"photo.on.rectangle.angled") }.buttonStyle(.plain).accessibilityIdentifier("share-image")
                    Divider()
                    Button { makeCalendar() } label: { shareCard("캘린더 파일로 보내기",detail:"받는 사람이 캘린더에 가져올 수 있어요",symbol:"calendar.badge.plus") }.buttonStyle(.plain).accessibilityIdentifier("share-calendar")
                    Divider()
                    Text("공유한 사본에는 이후 수정이 자동 반영되지 않습니다.").font(.footnote).foregroundStyle(.secondary)
                    if !message.isEmpty { Text(message).foregroundStyle(.red).accessibilityIdentifier("share-error") }
                }.padding()
            }.background(Color(.systemBackground)).navigationTitle("공유").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented:Binding(get:{linkURL != nil},set:{if !$0 {linkURL=nil}})) { if let linkURL { ShareSheet(items:[linkURL]) } }
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
    private func makeLink() {
        let days=store.month(month).map { ["type":$0.type.rawValue,"label":$0.type.label] }
        let payload:[String:Any] = ["v":1,"group":store.group,"month":ScheduleDisplay.title(month,format:"yyyy-MM"),"days":days]
        guard let data=try? JSONSerialization.data(withJSONObject:payload),let json=String(data:data,encoding:.utf8) else { message="링크를 만들지 못했습니다.";return }
        var parts=URLComponents(string:"https://h-lyart-ten.vercel.app/shared-schedule.html")!
        parts.fragment=json
        linkURL=parts.url
    }
    private func shareCard(_ title:String,detail:String,symbol:String)->some View {
        HStack(spacing:18) {
            Image(systemName:symbol).font(.system(size:23,weight:.regular)).foregroundStyle(.secondary).frame(width:30)
            VStack(alignment:.leading,spacing:5) { Text(title).font(.system(size:17,weight:.medium));Text(detail).font(.caption).foregroundStyle(.secondary) }
            Spacer();Image(systemName:"chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(.vertical,10).frame(minHeight:66).foregroundStyle(.primary)
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
            HStack { VStack(alignment:.leading,spacing:5) { Text("Shift_cal").font(.headline).foregroundStyle(WorkType.night.color);Text(ScheduleDisplay.title(month,format:"yyyy년 M월")).font(.title2.bold()) };Spacer();Text(group+"조").font(.title2.bold()) }
            MonthGrid(days:days,showMemos:includeMemos)
            HStack { Label("주간",systemImage:"sun.max.fill");Label("야간",systemImage:"moon.fill");Label("휴무",systemImage:"cup.and.saucer.fill") }.font(.caption).foregroundStyle(.secondary)
            if includeMemos {
                ForEach(days.filter{ !$0.memo.isEmpty }) { day in Text("\(ShiftPlanner.korea.component(.day,from:day.date))일 · \(day.memo)").font(.subheadline) }
            }
            Text("공유한 시점의 근무표 · 변경 시 다시 확인해 주세요").font(.caption).foregroundStyle(.secondary)
        }.padding(24).frame(width:420).background(Color(.systemBackground))
    }
}
