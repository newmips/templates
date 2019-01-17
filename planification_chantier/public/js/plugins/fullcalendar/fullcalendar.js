$(document).ready(function(){

	$("#toggle-sidebar-event").tipsy({fallback: "Ajout d'événement"});

	$("#selectCategory .select2-selection").css("background-color", "#CCCCCC");

	$("#selectCategory select").on("change", function(){
		$("#selectCategory .select2-selection").css("background-color", $("#selectCategory select option:selected").attr("data-backgroundcolor"));
		/* CUSTOM DEV */
		var isChantier = $("option:selected", this).attr("data-ischantier");
		if(isChantier == "true" || isChantier == true){
			$("#selectChantier").show();
			$("#new-event-title").val("");
			$("#new-event-title").val($("#selectChantier select option:selected").text());
			$("#new-event-title").hide();
		} else{
			$("#selectChantier").hide();
			$("#new-event-title").val("");
			$("#new-event-title").show();
		}
	});

	$("#selectChantier select").on("change", function(){
		$("#new-event-title").val("");
		$("#new-event-title").val($("#selectChantier select option:selected").text());
	});

	$(document).on("click", "#add-new-event", function(){

		var eventTitle = $("#new-event-title").val();

		if(eventTitle != ""){
			var categoryID = $("#selectCategory select").val();
			if(categoryID == "")
				categoryID = 0;
			var categoryColor = $("#selectCategory select option:selected").attr("data-backgroundcolor");

			var chantierID = null;
			var isChantier = $("#selectCategory select option:selected").attr("data-ischantier");
			if(isChantier == "true" || isChantier == true){
				chantierID = $("#selectChantier select").val();
			}

			var generateID = moment();
			var eventObj = '{"title": "'+eventTitle+'", "idCategory":'+categoryID+', "idChantier":'+chantierID+', "stick": "true","backgroundColor": "'+categoryColor+'", "borderColor": "'+categoryColor+'"}';

			var htmlToAppend = "<div data-event='"+eventObj+"' class='draggable pendingEvent external-event' id='"+generateID+"' style='z-index: 99999;background-color: "+categoryColor+";'>"+eventTitle+"<i style='margin-top: 3px;' class='fa fa-times pull-right'></i></div>";

			$("#pengingEventList").append(htmlToAppend);
			$("#new-event-title").val("");

			$("#"+generateID).draggable({
				revert: true,
				revertDuration: 0
			});
		} else {
			toastr.warning("Merci de renseigner un titre / chantier pour l'événement.");
		}
	});

	$(document).on("click", ".external-event i.fa.fa-times", function(){
		$(this).parent("div").remove();
	});

	$(document).on("click", "#toggle-sidebar-event", function(){
		if($("#event-sidebar").hasClass("hide")){
			$("#event-sidebar").removeClass("hide");
			$("#calendar-side").removeClass("col-md-12");
			$("#calendar-side").addClass("col-md-10");
			$(this).find("i").removeClass("fa-plus");
			$(this).find("i").addClass("fa-minus");
		}
		else{
			$("#event-sidebar").addClass("hide");
			$("#calendar-side").removeClass("col-md-10");
			$("#calendar-side").addClass("col-md-12");
			$(this).find("i").addClass("fa-plus");
			$(this).find("i").removeClass("fa-minus");
		}
	});
});