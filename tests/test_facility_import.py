"""Run with bundled Python: python -m unittest discover -s tests -p test_*.py."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('ingest', Path(__file__).resolve().parents[1]/'scripts/update-gyeonggi-facilities.py')
ingest = importlib.util.module_from_spec(spec); spec.loader.exec_module(ingest)


def province(name='공장', lat='37.2', lon='126.8', road='경기도 화성시 공단로 10', cat='4'):
    return {'사업장명':name,'WGS84위도':lat,'WGS84경도':lon,'소재지도로명주소':road,'소재지지번주소':'','대기종별구분명':cat,'업종명':'제조업'}


def national(name='공장', x='126.9', y='37.3', road='경기도 화성시 공단로 10'):
    return {'사업장명':name,'좌표정보(X)':x,'좌표정보(Y)':y,'도로명주소':road,'지번주소':''}


class ReconciliationTests(unittest.TestCase):
    def run_import(self,p,m): return ingest.reconcile(p,m,lambda x,y:(x,y))

    def test_province_priority_and_conflict_evidence(self):
        rows,stats,_=self.run_import([province()],[national()])
        self.assertEqual(rows[0][1:3],[37.2,126.8])
        self.assertEqual(rows[0][6][0],'gg')
        self.assertGreater(rows[0][6][3],1000)

    def test_missing_can_be_restored_by_name_and_address_only(self):
        rows,stats,_=self.run_import([province(name='(주)공장',lat='',lon='')],[national(name='주식회사공장')])
        self.assertEqual(rows[0][1:3],[37.3,126.9]);self.assertEqual(rows[0][6],['mois',2,2,None])
        for wrong in [national(name='다른공장'),national(road='경기도 화성시 공단로 11')]:
            rows,stats,_=self.run_import([province(lat='',lon='')],[wrong])
            self.assertEqual(rows,[]);self.assertEqual(stats['excludedRows'],1)

    def test_ambiguous_or_invalid_coordinates_are_not_guessed(self):
        for m in [[national(),national(x='126.91')],[national(x='0',y='0')],[national(x='',y='')]]:
            rows,stats,excluded=self.run_import([province(lat='',lon='')],m)
            self.assertEqual(rows,[]);self.assertEqual(len(excluded),1)

    def test_duplicates_do_not_remove_collocated_businesses(self):
        rows,stats,_=self.run_import([province(),province(),province(name='다른공장'),province(cat='5')],[])
        self.assertEqual(len(rows),3);self.assertEqual(stats['duplicateRowsRemoved'],1)

    def test_national_only_records_are_not_added(self):
        rows,stats,_=self.run_import([province()],[national(name='새공장')])
        self.assertEqual(len(rows),1);self.assertEqual(rows[0][0],'공장')


if __name__=='__main__': unittest.main()
