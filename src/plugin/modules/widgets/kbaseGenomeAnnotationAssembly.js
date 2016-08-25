
define (
    [
        'jquery',
        'bluebird',
        'bootstrap',
        'datatables',
        'kb/widget/legacy/authenticatedWidget',
        'kb/service/client/workspace',
        'kb_sdk_clients/AssemblyAPI/dev/AssemblyAPIClient',
    ], function(
        $,
        Promise,
        bootstrap,
        jquery_dataTables,
        kbaseAuthenticatedWidget,
        Workspace,
        Assembly
    ) {
    'use strict';

    $.KBWidget({
        name: "kbaseGenomeAnnotationAssembly",
        parent : kbaseAuthenticatedWidget,
        version: "1.0.0",
        options: {


        },

        init: function init(options) {
            this._super(options);

            var $self = this;

            $self.runtime = options.runtime;

            if($self.options.ref) {
                $self.obj_ref = $self.options.ref;
            } else {
                $self.obj_ref = $self.options.wsNameOrId + '/' + $self.options.objNameOrId;
            }
            $self.link_ref = $self.obj_ref;

            $self.assembly = new Assembly({
                                        url: $self.runtime.getConfig('services.service_wizard.url'),
                                        auth: {'token':$self.runtime.service('session').getAuthToken()},
                                        version: 'dev'
                                    });
            $self.ws = new Workspace($self.runtime.getConfig('services.workspace.url'),{'token':$self.runtime.service('session').getAuthToken()});
            
            $self.$elem.append($('<div>').attr('align', 'center').append($('<i class="fa fa-spinner fa-spin fa-2x">')));

            // 1) get stats, and show the panel
            var basicInfoCalls = [];
            basicInfoCalls.push(
                $self.assembly.get_stats($self.obj_ref, null)
                        .then(function(stats) {
                            $self.assembly_stats = stats;
                        }));
            basicInfoCalls.push(
                $self.assembly.get_external_source_info($self.obj_ref, null)
                        .then(function(info) {
                            $self.external_source_info = info;
                        }));

            basicInfoCalls.push(
                $self.ws.get_object_info_new({objects: [{'ref':$self.obj_ref}], includeMetadata:1})
                        .then(function(info) {
                            $self.assembly_obj_info = info[0];
                            $self.link_ref = info[0][6] + '/' + info[0][1] + '/' + info[0][4];
                        }));
            Promise.all(basicInfoCalls)
                .then(function() {
                   $self.renderBasicTable();
                })
                .catch(function(err) {
                    $self.$elem.empty();
                    $self.$elem.append('Error' + JSON.stringify(err));
                    console.error(err);
                });

            return this;
        },


        processContigData: function() {
            var $self = this;

            var contig_table = [];
            for (var id in $self.contig_lengths) {
                if ($self.contig_lengths.hasOwnProperty(id)) {
                    var gc='unknown';
                    if($self.contig_lengths.hasOwnProperty(id)) {
                        gc = String(($self.contig_gc[id]*100).toFixed(2)) + '%';
                    }
                    var contig = {
                        id: id,
                        len: '<!--' + $self.contig_lengths[id] + '-->' + String($self.numberWithCommas($self.contig_lengths[id]))+' bp',
                        gc:  gc
                    };
                    contig_table.push(contig);
                }
            }
            $self.contig_table = contig_table;
            //console.log(contig_table);
        },


        renderBasicTable: function() {
            var $self = this;
            var $container = this.$elem;
            $container.empty();

            // Build the overview table
            var $overviewTable = $('<table class="table table-striped table-bordered table-hover" style="margin-left: auto; margin-right: auto;"/>');

            function get_table_row(key, value) {
                return $('<tr>').append($('<td>').append(key)).append($('<td>').append(value));
            }

            $overviewTable.append(get_table_row('Number of Contigs', $self.assembly_stats['num_contigs'] ));
            $overviewTable.append(get_table_row('Total GC Content',  String(($self.assembly_stats['gc_content']*100).toFixed(2)) + '%' ));
            $overviewTable.append(get_table_row('Total Length',      String($self.numberWithCommas($self.assembly_stats['dna_size']))+' bp'  )  );

            $overviewTable.append(get_table_row('External Source',         $self.external_source_info['external_source']  ));
            $overviewTable.append(get_table_row('External Source ID',      $self.external_source_info['external_source_id']  ));
            $overviewTable.append(get_table_row('Source Origination Date', $self.external_source_info['external_source_origination_date']  ));
            
            
            // add the stuff
            $container.append($('<div>').append($overviewTable));
            $container.append($('<div>').append($self.addContigList()));
        },

        addContigList: function() {
            var $self = this;
            var $content = $('<div>');
            $self.$contigTablePanel = $content;


            // Get contig lengths and gc, render the table
            
            $self.assembly_stats = {};
            $self.contig_lengths = [];
            $self.contig_gc = [];

            var loadingCalls = [];
            loadingCalls.push(
                $self.assembly.get_contig_lengths(this.obj_ref, null)
                            .then(function(lengths) {
                                $self.contig_lengths = lengths;
                            }));
            loadingCalls.push(
                $self.assembly.get_contig_gc_content(this.obj_ref, null)
                    .then(function(gc) {
                                $self.contig_gc = gc;
                            }));

            Promise.all(loadingCalls)
                .then(function() {
                    $self.processContigData();

                    // sort extension for length- is there a better way?
                    if(!$.fn.dataTableExt.oSort['genome-annotation-assembly-hidden-number-stats-pre']) {
                        $.extend( $.fn.dataTableExt.oSort, {
                            "genome-annotation-assembly-hidden-number-stats-pre": function ( a ) {
                                // extract out the first comment if it exists, then parse as number
                                var t = a.split('-->');
                                if(t.length>1) {
                                    var t2 = t[0].split('<!--');
                                    if(t2.length>1) {
                                        return Number(t2[1]);
                                    }
                                }
                                return Number(a);
                            },
                            "genome-annotation-assembly-hidden-number-stats-asc": function( a, b ) {
                                return ((a < b) ? -1 : ((a > b) ? 1 : 0));
                            },
                            "genome-annotation-assembly-hidden-number-stats-desc": function(a,b) {
                                return ((a < b) ? 1 : ((a > b) ? -1 : 0));
                            }
                        } );
                    }

                    ////////////////////////////// Contigs Tab //////////////////////////////
                    var $table = $('<table class="table table-striped table-bordered table-hover" style="width: 100%; border: 1px solid #ddd; margin-left: auto; margin-right: auto;" >');

                    var contigsPerPage = 10;
                    var sDom = 'lft<ip>';
                    if($self.contig_table.length<contigsPerPage) {
                        sDom = 'fti';
                    }

                    var contigsSettings = {
                        "bFilter": true,
                        "sPaginationType": "full_numbers",
                        "iDisplayLength": contigsPerPage,
                        "aaSorting": [[ 1, "desc" ]],
                        
                        "sDom": sDom,

                        "columns": [
                            {sTitle: 'Contig Id', data: "id"},
                            {sTitle: "Length", data: "len"},
                            {sTitle: "GC Content", data: "gc"}
                        ],
                        "columnDefs": [
                            { "type": "genome-annotation-assembly-hidden-number-stats", targets: [1] }
                        ],
                        "data": $self.contig_table,
                        "language": {
                            "lengthMenu": "_MENU_ Contigs per page",
                            "zeroRecords": "No Matching Contigs Found",
                            "info": "Showing _START_ to _END_ of _TOTAL_ Contigs",
                            "infoEmpty": "No Contigs",
                            "infoFiltered": "(filtered from _MAX_)",
                            "search" : "Search Contigs"
                        }
                    };
                    $content.empty();
                    $content.append($('<div>').css('padding','10px 0px').append($table));
                    $table.dataTable(contigsSettings);
                })
                .catch(function(err) {
                    $content.empty();
                    $content.append('Error' + JSON.stringify(err));
                    console.err($self);
                    console.err(err);
                });
            
            return $content.append('<br>').append($('<div>').attr('align', 'center').append($('<i class="fa fa-spinner fa-spin fa-2x">')));
        },

        appendUI: function appendUI($elem) {
          $elem.append("One day, there will be a widget here.")
        },

        numberWithCommas: function(x) {
            //var parts = x.toString().split(".");
            //parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            //return parts.join(".");
            return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }

    });

});
